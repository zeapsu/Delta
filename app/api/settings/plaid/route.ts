import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { resetPlaidCheck, testPlaidKeys } from "@/lib/plaid-config";
import { hint, parsePlaidKeysInput } from "@/lib/plaid-keys";
import { currentPlaidKeys, savePlaidKeys } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Plaid keys entered in the browser (/setup), for installs with no .env.
// Never returns the secret. The environment wins: when PLAID_CLIENT_ID is
// set there, this route only reports it.
function status() {
  const keys = currentPlaidKeys();
  return {
    source: keys.source,
    env: keys.env,
    clientId: hint(keys.clientId),
    configured: Boolean(keys.clientId && keys.secret),
  };
}

export async function GET() {
  return NextResponse.json(status());
}

// Body: { env: "sandbox" | "production", clientId, secret }. The pair is
// checked against Plaid before it's saved.
export async function PUT(req: Request) {
  const current = currentPlaidKeys();
  if (current.source === "env") {
    return NextResponse.json(
      { error: "Plaid keys come from .env on this install. Change them there and restart Delta." },
      { status: 409 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = parsePlaidKeysInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Sandbox items don't work against production (and the fake data would mix
  // with real data), so the environment is fixed once a bank is linked.
  const linked = db.select({ id: items.id }).from(items).limit(1).all().length > 0;
  if (linked && current.source === "setup" && current.env !== parsed.value.env) {
    return NextResponse.json(
      {
        error: `Banks are already linked in ${current.env}. To switch to ${parsed.value.env}, start with a fresh install (see the self-hosting guide).`,
      },
      { status: 409 },
    );
  }

  const check = await testPlaidKeys({ ...parsed.value, source: "setup" });
  if (!check.ok) return NextResponse.json({ error: check.problems.join("; ") }, { status: 400 });

  savePlaidKeys(parsed.value);
  resetPlaidCheck();
  console.log(`[delta] Plaid ${parsed.value.env}: keys saved from the setup page`);
  return NextResponse.json({ ok: true, ...status() });
}
