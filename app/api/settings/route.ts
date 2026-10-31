import { NextResponse } from "next/server";
import { parseAnalysisSettings } from "@/lib/analysis";
import { getAnalysisSettings, saveAnalysisSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await getAnalysisSettings());
}

// Body: { analysis: { baselineMonths, spikePct, spikeMinDollars, trendMonths, budgetWarnPct } },
// every key required (the form always sends all of them).
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = parseAnalysisSettings((body as { analysis?: unknown }).analysis);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await saveAnalysisSettings(parsed.value);
  return NextResponse.json({ ok: true, analysis: parsed.value });
}
