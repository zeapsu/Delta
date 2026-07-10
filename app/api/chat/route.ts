import { NextResponse } from "next/server";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

// 30 min: real advisory turns run many SQL queries and long models — the
// timeout is only a hung-turn backstop (#46), enforced via session.interrupt.
const TIMEOUT_MS = 1_800_000;
const MAX_MESSAGE_LENGTH = 4000;

// hermes serve gateway (#48): a persistent `hermes serve --host 127.0.0.1
// --port 9117` process (hermes-serve.service on the Jetson). Loopback bind is
// what enables ?token= auth — any non-loopback bind flips hermes to its OAuth
// gate. The token is hermes' own env var, shared with this process via .env.
const GATEWAY = process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:9117";
const TOKEN = process.env.HERMES_DASHBOARD_SESSION_TOKEN ?? "";
// Per-session cwd drives hermes' AGENTS.md auto-load — advisor-home/AGENTS.md
// symlinks to ADVISOR.md so replies talk finances, not milestones (#47).
const ADVISOR_HOME = path.join(process.cwd(), "deploy", "advisor-home");

// ponytail: the tailnet is the real trust boundary (no route in this app has
// auth); this guard refuses first-hop addresses outside loopback and the
// tailscale CGNAT range (100.64.0.0/10). Next.js fills x-forwarded-for with
// the real peer when the client sends none (verified), but a client-supplied
// header wins — spoofable by anyone who can already reach the port. M6 closes
// that by binding the server to the tailscale interface.
function allowed(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  const m = ip.match(/^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/);
  return m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

// The browser stream is NDJSON: {"t":"text","v":...} appends to the reply and
// the persisted transcript; {"t":"status","v":...} is an ephemeral progress
// line (tool activity) the client shows under the thinking indicator.
type Frame = { t: "text" | "status"; v: string };

function runHermes(
  message: string,
  conversationId: number,
): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<void>;
} {
  const encoder = new TextEncoder();
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  // Persist exactly what the user saw (text frames incl. any trailing error
  // line) as the assistant turn; hermes' own session is the model's memory.
  let assistantText = "";
  let persisted = false;
  const persist = () => {
    if (persisted) return;
    persisted = true;
    db.insert(messages)
      .values({ conversationId, role: "assistant", text: assistantText })
      .run();
  };

  let ws: WebSocket | null = null;
  let sessionId: string | null = null;
  let finished = false;

  // Minimal JSON-RPC client: one pending map, incrementing ids.
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  const rpc = (method: string, params: object) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws!.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  const rejectPending = (reason: string) => {
    for (const p of pending.values()) p.reject(new Error(reason));
    pending.clear();
  };
  const interrupt = () => {
    if (sessionId && ws?.readyState === WebSocket.OPEN) {
      rpc("session.interrupt", { session_id: sessionId }).catch(() => {});
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: Frame) => {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        if (frame.t === "text") assistantText += frame.v;
      };
      const finish = (errorLine?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (errorLine) send({ t: "text", v: errorLine });
        persist();
        rejectPending("finished");
        try {
          ws?.close();
        } catch {}
        controller.close();
        resolveDone();
      };
      const timer = setTimeout(() => {
        interrupt();
        finish("\n[hermes failed (timeout)]");
      }, TIMEOUT_MS);
      const emit = (frame: Frame) => {
        if (!finished && frame.v) send(frame);
      };

      const startTurn = async () => {
        // ponytail: session identity = resume-by-title "delta-chat-<id>".
        // resume follows hermes' compression-continuation chains, so durable
        // key rotation is handled server-side. Upgrade path if title lookup
        // ever misbehaves: store stored_session_id on conversations and
        // refresh it from session.info events.
        const key = `delta-chat-${conversationId}`;
        let s: { session_id?: string };
        try {
          s = (await rpc("session.resume", { session_id: key })) as typeof s;
        } catch (err) {
          if ((err as { code?: number })?.code !== 4007) throw err; // 4007 = not found
          s = (await rpc("session.create", {
            cwd: ADVISOR_HOME,
            title: key,
            source: "delta",
          })) as typeof s;
        }
        sessionId = s.session_id ?? null;
        await rpc("prompt.submit", { session_id: sessionId, text: message });
      };

      const dispatch = (msg: {
        id?: number;
        method?: string;
        result?: unknown;
        error?: { code?: number; message?: string };
        params?: { type: string; session_id?: string; payload?: Record<string, unknown> };
      }) => {
        if (msg.id !== undefined && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) p.reject(msg.error);
          else p.resolve(msg.result);
          return;
        }
        if (msg.method !== "event" || !msg.params) return;
        const { type, session_id, payload } = msg.params;
        if (type === "gateway.ready") {
          startTurn().catch((err) =>
            finish(
              `\n[hermes failed: ${
                (err as { message?: string })?.message ?? String(err)
              }]`,
            ),
          );
          return;
        }
        if (!sessionId || session_id !== sessionId) return; // not our session
        if (type === "message.delta") {
          emit({ t: "text", v: String(payload?.text ?? "") });
        } else if (type === "message.complete") {
          // deltas already streamed; complete.text is a fallback if none came
          if (assistantText === "" && payload?.text) {
            emit({ t: "text", v: String(payload.text) });
          }
          finish(
            payload?.status === "complete"
              ? undefined
              : `\n[hermes failed (${payload?.status})]`,
          );
        } else if (type === "error") {
          finish(`\n[hermes failed: ${payload?.message ?? "unknown error"}]`);
        } else if (type === "tool.start" || type === "tool.generating") {
          emit({ t: "status", v: String(payload?.name ?? "working") });
        } else if (type === "status.update") {
          emit({ t: "status", v: String(payload?.text ?? "") });
        } else if (type.endsWith(".request") && payload?.request_id) {
          // ponytail: headless bridge — fail now rather than wait out the
          // gateway's 300s unanswered-request timeout. Upgrade path: auto-deny
          // via approval.respond if this ever fires in practice.
          interrupt();
          finish(`\n[hermes failed: agent requested interactive input (${type})]`);
        }
        // thinking/reasoning deltas, tool.complete, session.info: ignored
      };

      const url = new URL("/api/ws", GATEWAY);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("token", TOKEN);
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          dispatch(JSON.parse(String(e.data)));
        } catch {
          /* ignore junk frame */
        }
      };
      ws.onerror = () => finish("\n[bridge error: hermes gateway unreachable]");
      ws.onclose = () => finish("\n[bridge error: hermes gateway closed connection]");
    },
    cancel() {
      // browser went away mid-turn: stop the agent, persist what streamed
      finished = true;
      interrupt();
      persist();
      rejectPending("cancelled");
      try {
        ws?.close();
      } catch {}
      resolveDone();
    },
  });
  return { stream, done };
}

// ponytail: module-level promise chain serializes turns — global on purpose:
// one hermes turn at a time even across conversations (single user, single
// box); per-conversation queues if this ever goes multi-user.
let queue: Promise<void> = Promise.resolve();

export async function POST(req: Request) {
  if (!allowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { message, conversationId } = body as {
    message?: unknown;
    conversationId?: unknown;
  };
  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (
    typeof conversationId !== "number" ||
    !Number.isInteger(conversationId) ||
    conversationId <= 0
  ) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }
  const known = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (known.length === 0) {
    return NextResponse.json({ error: "Unknown conversation" }, { status: 404 });
  }

  // Persist the user turn up front so it survives even if hermes fails.
  await db.insert(messages).values({ conversationId, role: "user", text: message });

  const prev = queue;
  let release!: () => void;
  queue = new Promise((r) => (release = r));
  await prev;

  // ponytail: errors (gateway down, bad token, turn failure) surface as a
  // trailing bracketed text frame in the 200 stream instead of a 502 — the
  // response has already started by the time hermes can fail.
  const { stream, done } = runHermes(message, conversationId);
  void done.then(release);
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
