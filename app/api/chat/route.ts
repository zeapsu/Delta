import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

const TIMEOUT_MS = 120_000;
const MAX_MESSAGE_LENGTH = 4000;

// ponytail: the tailnet is the real trust boundary (no route in this app has
// auth); this guard only refuses requests whose first-hop address is neither
// loopback nor the tailscale CGNAT range (100.64.0.0/10).
function allowed(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  const m = ip.match(/^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/);
  return m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

function runHermes(message: string): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<void>;
} {
  const child = spawn(
    process.env.HERMES_CMD ?? "hermes",
    ["-z", message, "--skills", "delta-finance", "--continue", "delta-chat"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  const encoder = new TextEncoder();
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
  let stderrTail = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-300);
  });

  let finished = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (errorLine?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (errorLine) controller.enqueue(encoder.encode(errorLine));
        controller.close();
        resolveDone();
      };
      child.stdout.on("data", (chunk: Buffer) => {
        if (!finished) controller.enqueue(new Uint8Array(chunk));
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
      child.kill("SIGKILL");
      resolveDone();
    },
  });
  return { stream, done };
}

// ponytail: module-level promise chain serializes turns — single user, one
// hermes process at a time; per-session queues if this ever goes multi-user.
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

  const { message } = body as { message?: unknown };
  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const prev = queue;
  let release!: () => void;
  queue = new Promise((r) => (release = r));
  await prev;

  // ponytail: errors (nonzero exit, timeout kill, spawn failure) surface as a
  // trailing bracketed line in the 200 stream instead of a 502 — the response
  // has already started by the time hermes can fail.
  const { stream, done } = runHermes(message);
  void done.then(release);
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
