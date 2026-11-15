import { NextResponse } from "next/server";
import { sentByAgent } from "@/lib/agent-config";
import { backupBeforeUpdate, readUpdaterStatus, requestUpdate } from "@/lib/updater";

export const dynamic = "force-dynamic";

// The header's Update pill (app/update-pill.tsx): how an update is going, and
// asking for one. Behind the session login like every dashboard route (proxy.ts
// gate()), and a bearer token is refused: updating is for the person at the
// dashboard, not an agent.
export function GET() {
  const { available, state, message, requestedAt } = readUpdaterStatus();
  return NextResponse.json({ available, state, message, requestedAt });
}

let starting = false;

export async function POST(req: Request) {
  if (sentByAgent(req)) return NextResponse.json({ error: "Updating is done from the dashboard." }, { status: 403 });
  const status = readUpdaterStatus();
  if (!status.available) return NextResponse.json({ error: "Updates from the app aren't turned on." }, { status: 409 });
  if (starting || status.state === "pulling" || status.state === "restarting") {
    return NextResponse.json({ error: "An update is already running." }, { status: 409 });
  }
  starting = true;
  try {
    try {
      await backupBeforeUpdate();
    } catch (err) {
      console.error("[delta] pre-update backup failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Couldn't back up the database first, so nothing was updated." }, { status: 500 });
    }
    let requestedAt: number;
    try {
      requestedAt = requestUpdate();
    } catch (err) {
      console.error("[delta] update request failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "Couldn't ask for the update." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, requestedAt }, { status: 202 });
  } finally {
    starting = false;
  }
}
