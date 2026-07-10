import assert from "node:assert";
import { detectRecurring } from "./recurring";

const today = "2026-07-09";

// Monthly Netflix: 4 txns ~30 days apart, same amount.
const netflix = [
  { name: "NETFLIX", merchantName: "Netflix", amount: 15_49, date: "2026-04-09" },
  { name: "NETFLIX", merchantName: "Netflix", amount: 15_49, date: "2026-05-09" },
  { name: "NETFLIX", merchantName: "Netflix", amount: 15_49, date: "2026-06-09" },
  { name: "NETFLIX", merchantName: "Netflix", amount: 15_49, date: "2026-07-08" },
];

// Noisy merchant: 3 txns, random dates/amounts — should not be detected.
const noisy = [
  { name: "RANDOM STORE", merchantName: null, amount: 12_00, date: "2026-01-05" },
  { name: "RANDOM STORE", merchantName: null, amount: 47_23, date: "2026-03-19" },
  { name: "RANDOM STORE", merchantName: null, amount: 3_50, date: "2026-06-01" },
];

// Canceled gym: monthly cadence but last txn 90+ days before today.
const gym = [
  { name: "GYM", merchantName: "Gym", amount: 40_00, date: "2026-01-10" },
  { name: "GYM", merchantName: "Gym", amount: 40_00, date: "2026-02-09" },
  { name: "GYM", merchantName: "Gym", amount: 40_00, date: "2026-03-11" },
];

// Merchant with digit suffixes should group together (recent dates so it
// isn't dropped as stale relative to `today`).
const uber = [
  { name: "Uber 072515", merchantName: null, amount: 22_00, date: "2026-06-11" },
  { name: "Uber 063015", merchantName: null, amount: 22_50, date: "2026-06-25" },
  { name: "Uber 081215", merchantName: null, amount: 21_75, date: "2026-07-09" },
];

// Gym with a signup charge the day before the first monthly bill (seen in
// production): the single off-amount txn must not veto the series.
const fitne = [
  { name: "FITNE", merchantName: "Fitne", amount: 59_99, date: "2026-04-28" },
  { name: "FITNE", merchantName: "Fitne", amount: 34_99, date: "2026-04-29" },
  { name: "FITNE", merchantName: "Fitne", amount: 34_99, date: "2026-05-29" },
  { name: "FITNE", merchantName: "Fitne", amount: 34_99, date: "2026-06-29" },
];

// Loan payment with real-world jitter (seen in production): identical
// amounts, gaps of 39 and 22 days around a monthly cadence.
const uas = [
  { name: "UAS", merchantName: "UAS", amount: 251_07, date: "2026-05-08" },
  { name: "UAS", merchantName: "UAS", amount: 251_07, date: "2026-06-16" },
  { name: "UAS", merchantName: "UAS", amount: 251_07, date: "2026-07-08" },
];

const all = [...netflix, ...noisy, ...gym, ...uber, ...fitne, ...uas];
const results = detectRecurring(all, today);

const netflixResult = results.find((r) => r.merchant === "Netflix");
assert(netflixResult, "Netflix should be detected");
assert.strictEqual(netflixResult.cadence, "monthly", "Netflix should be monthly");
assert.strictEqual(netflixResult.gapDays, 30, "Netflix median gap should be 30 days");
assert.strictEqual(netflixResult.lastDate, "2026-07-08", "Netflix lastDate should match");
assert.strictEqual(netflixResult.nextDate, "2026-08-07", "Netflix nextDate should be ~30d after last");

assert(!results.some((r) => r.merchant === "RANDOM STORE"), "noisy merchant should not be detected");

assert(!results.some((r) => r.merchant === "Gym"), "canceled gym should not be detected (stale)");

const uberResult = results.find((r) => r.merchant.startsWith("Uber"));
assert(uberResult, "Uber txns with digit suffixes should group together and be detected");
assert.strictEqual(uberResult.count, 3, "Uber group should have 3 txns");

const fitneResult = results.find((r) => r.merchant === "Fitne");
assert(fitneResult, "Fitne should be detected despite the signup-charge outlier");
assert.strictEqual(fitneResult.cadence, "monthly", "Fitne should be monthly");
assert.strictEqual(fitneResult.amount, 34_99, "Fitne amount should be the regular charge");
assert.strictEqual(fitneResult.count, 3, "Fitne count should exclude the dropped outlier");

const uasResult = results.find((r) => r.merchant === "UAS");
assert(uasResult, "UAS should be detected despite gap jitter");

console.log("lib/recurring-check.ts: all assertions passed");
