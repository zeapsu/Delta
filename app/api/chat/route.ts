import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

// 30 min: real advisory turns run many SQL queries and long models — the
// timeout is only a hung-process backstop (#46).
const TIMEOUT_MS = 1_800_000;
const MAX_MESSAGE_LENGTH = 4000;

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

function runHermes(
  message: string,
  conversationId: number,
): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<void>;
} {
  // hermes -z auto-loads AGENTS.md from its cwd (cwd only, no upward walk).
  // Spawning in the repo root fed it the dev doc, so replies talked about
  // milestones instead of finances (#47) — advisor-home/AGENTS.md symlinks
  // to ADVISOR.md. A path-y HERMES_CMD (e.g. ./scripts/hermes-stub.sh) is
  // resolved against the repo root before the cwd changes under it.
  const cmd = process.env.HERMES_CMD ?? "hermes";
  const child = spawn(
    cmd.includes("/") ? path.resolve(cmd) : cmd,
    [
      "-z",
      message,
      "--skills",
      "delta-finance",
      "--continue",
      `delta-chat-${conversationId}`,
    ],
    // detached: own process group, so timeout/cancel kills hermes AND any
    // tool subprocesses it spawned, not just the direct child
    {
      cwd: path.join(process.cwd(), "deploy", "advisor-home"),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  const killTree = () => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const encoder = new TextEncoder();
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const timer = setTimeout(killTree, TIMEOUT_MS);
  let stderrTail = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-300);
  });

  // Persist exactly what the user saw (including any trailing error line) as
  // the assistant turn; hermes's own --continue session is the model's memory.
  let assistantText = "";
  let persisted = false;
  const persist = () => {
    if (persisted) return;
    persisted = true;
    db.insert(messages)
      .values({ conversationId, role: "assistant", text: assistantText })
      .run();
  };

  let finished = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (errorLine?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (errorLine) {
          controller.enqueue(encoder.encode(errorLine));
          assistantText += errorLine;
        }
        persist();
        controller.close();
        resolveDone();
      };
      child.stdout.on("data", (chunk: Buffer) => {
        if (!finished) {
          controller.enqueue(new Uint8Array(chunk));
          assistantText += chunk.toString();
        }
      });
      child.on("error", (err) => finish(`\n[bridge error: ${err.message}]`));
      child.on("close", (code, signal) =>
        finish(
          code === 0
            ? undefined
            : `\n[hermes failed (${signal ?? `exit ${code}`})${
                stderrTail ? `: ${stderrTail.trim()}` : ""
              }]`,
        ),
      );
    },
    cancel() {
      finished = true;
      clearTimeout(timer);
      killTree();
      persist();
      resolveDone();
    },
  });
  return { stream, done };
}

// ponytail: module-level promise chain serializes turns — global on purpose:
// one hermes process at a time even across conversations (single user, single
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

  // ponytail: errors (nonzero exit, timeout kill, spawn failure) surface as a
  // trailing bracketed line in the 200 stream instead of a 502 — the response
  // has already started by the time hermes can fail.
  const { stream, done } = runHermes(message, conversationId);
  void done.then(release);
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
