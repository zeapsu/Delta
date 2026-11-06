import { NextResponse } from "next/server";
import { parseTokenName, sentByAgent } from "@/lib/agent-config";
import { createToken, listTokens } from "@/lib/api-tokens";

// Settings → Agents: list and create agent tokens from the browser (the CLI,
// `npm run token`, does the same on the host). The network guard in proxy.ts
// applies as for every dashboard route; agents are refused (sentByAgent).
const AGENT_REFUSED = { error: "Agents can't manage tokens" };

export async function GET(req: Request) {
  if (sentByAgent(req)) return NextResponse.json(AGENT_REFUSED, { status: 403 });
  const tokens = (await listTokens())
    .filter((t) => !t.revokedAt)
    .map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, scope: t.scope, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt }));
  return NextResponse.json({ tokens });
}

// Body: { name, scope: "read" | "write" }. Answers the token once; only its
// hash is stored.
export async function POST(req: Request) {
  if (sentByAgent(req)) return NextResponse.json(AGENT_REFUSED, { status: 403 });
  let body: { name?: unknown; scope?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = parseTokenName(body?.name);
  if (!name) return NextResponse.json({ error: "Name must be 1 to 60 characters" }, { status: 400 });
  const scope = body.scope;
  if (scope !== "read" && scope !== "write") {
    return NextResponse.json({ error: 'Scope must be "read" or "write"' }, { status: 400 });
  }
  const { id, token } = await createToken(name, scope);
  return NextResponse.json({ id, name, scope, token }, { status: 201 });
}
