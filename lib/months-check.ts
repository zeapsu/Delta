import assert from "node:assert";
import { currentMonth, daysAgoISO, daysUntil, isDate, todayISO } from "./months";
import { partitionSeries, type RecurringRule } from "./recurring";

// Day helpers follow the process time zone (the saved one, see lib/profile.ts),
// never UTC. CI runs this under UTC+14 and UTC-11 as well: at any hour the
// local day differs from the UTC day in one of them, so a helper that slips
// back to toISOString() fails there.
const localDay = () =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const before = localDay();
const today = todayISO();
assert(today === before || today === localDay(), `todayISO() ${today} is not the local day ${before}`);
assert(today.startsWith(currentMonth()), "today is in the current month");
assert.strictEqual(daysAgoISO(0), today);
for (const n of [1, 30, 365]) assert.strictEqual(daysUntil(today, daysAgoISO(n)), n, `${n} days ago`);

// Recurring's default "today" is the same local day: an anchor of tomorrow is
// still ahead, and one of today rolls a period on.
const rule: RecurringRule = { id: 1, status: "confirmed", matchKey: null, name: "Probe", amount: 1_00, gapDays: 7, anchorDate: today };
const next = (anchorDate: string) => partitionSeries([], [{ ...rule, anchorDate }]).nextDates.get(1)?.nextDate;
const tomorrow = daysAgoISO(-1);
assert.strictEqual(next(tomorrow), tomorrow, "an anchor of tomorrow is the next date");
assert.strictEqual(next(today), daysAgoISO(-7), "an anchor of today rolls one period on");

// Real calendar days only.
for (const ok of ["2026-02-28", "2024-02-29", "1999-12-31"]) assert(isDate(ok), ok);
for (const bad of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "0000-00-00", "2026-1-1", "20260101", "", null, 20260101, ["2026-01-01"]]) {
  assert(!isDate(bad), `not a date: ${JSON.stringify(bad)}`);
}

console.log("lib/months-check.ts: all assertions passed");
