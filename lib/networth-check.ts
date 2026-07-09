import assert from "node:assert";
import { forwardFillNetWorth } from "./networth";

// Two accounts; "checking" misses day 2, should carry forward its day-1 balance.
const missingMiddleDay = [
  { accountId: "checking", day: "2026-07-01", adj: 1000 },
  { accountId: "checking", day: "2026-07-03", adj: 1200 },
  { accountId: "savings", day: "2026-07-01", adj: 500 },
  { accountId: "savings", day: "2026-07-02", adj: 500 },
  { accountId: "savings", day: "2026-07-03", adj: 500 },
];
const filled = forwardFillNetWorth(missingMiddleDay);
const day2 = filled.find((r) => r.day === "2026-07-02");
assert(day2, "day 2 should exist (from savings snapshot)");
assert.strictEqual(day2.net_worth, 1500, "day 2 should carry checking's day-1 balance (1000 + 500)");

// Debt account: adj already negated by the SQL layer, should fill unchanged.
const withDebt = [
  { accountId: "checking", day: "2026-07-01", adj: 1000 },
  { accountId: "checking", day: "2026-07-02", adj: 1000 },
  { accountId: "credit-card", day: "2026-07-01", adj: -300 },
];
const debtFilled = forwardFillNetWorth(withDebt);
const debtDay2 = debtFilled.find((r) => r.day === "2026-07-02");
assert(debtDay2, "day 2 should exist");
assert.strictEqual(debtDay2.net_worth, 700, "debt balance should carry forward negative (1000 - 300)");

// No back-fill before an account's first snapshot day.
const laterLinked = [
  { accountId: "checking", day: "2026-07-01", adj: 1000 },
  { accountId: "checking", day: "2026-07-02", adj: 1000 },
  { accountId: "checking", day: "2026-07-03", adj: 1000 },
  { accountId: "new-account", day: "2026-07-03", adj: 200 },
];
const laterFilled = forwardFillNetWorth(laterLinked);
const day1 = laterFilled.find((r) => r.day === "2026-07-01");
assert(day1, "day 1 should exist");
assert.strictEqual(day1.net_worth, 1000, "new-account should not be back-filled before its first snapshot");
const day3 = laterFilled.find((r) => r.day === "2026-07-03");
assert(day3, "day 3 should exist");
assert.strictEqual(day3.net_worth, 1200, "new-account should count once it appears");

console.log("lib/networth-check.ts: all assertions passed");
