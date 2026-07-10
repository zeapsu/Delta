import assert from "node:assert";
import { detectRecurring, partitionSeries, type RecurringRule } from "./recurring";

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
const gymSignup = [
  { name: "IRONWORKS GYM", merchantName: "Ironworks Gym", amount: 59_99, date: "2026-04-28" },
  { name: "IRONWORKS GYM", merchantName: "Ironworks Gym", amount: 34_99, date: "2026-04-29" },
  { name: "IRONWORKS GYM", merchantName: "Ironworks Gym", amount: 34_99, date: "2026-05-29" },
  { name: "IRONWORKS GYM", merchantName: "Ironworks Gym", amount: 34_99, date: "2026-06-29" },
];

// Loan payment with real-world jitter (seen in production): identical
// amounts, gaps of 39 and 22 days around a monthly cadence.
const loanJitter = [
  { name: "LOANSERV", merchantName: "LOANSERV", amount: 251_07, date: "2026-05-08" },
  { name: "LOANSERV", merchantName: "LOANSERV", amount: 251_07, date: "2026-06-16" },
  { name: "LOANSERV", merchantName: "LOANSERV", amount: 251_07, date: "2026-07-08" },
];

// Rent via bank transfer (seen in production): each payment embeds a unique
// alphanumeric reference code, and amounts drift slightly month to month.
const rent = [
  { name: "OAKS PROPERTY PAY ST-A7R5F7J5A2P7 TENANT", merchantName: null, amount: 1405_30, date: "2026-05-04" },
  { name: "OAKS PROPERTY PAY ST-B3J3Z9O5M3E4 TENANT", merchantName: null, amount: 1439_19, date: "2026-06-01" },
  { name: "OAKS PROPERTY PAY ST-P0J5M4Y3L2M9 TENANT", merchantName: null, amount: 1404_28, date: "2026-07-02" },
];

// One merchant, two subscriptions + one-off purchases (seen in production:
// Apple): amount clustering must separate the $9.99 and $19.99 series and
// discard the noise.
const apple = [
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 9_99, date: "2026-04-25" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 9_99, date: "2026-05-30" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 9_99, date: "2026-06-25" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 19_99, date: "2026-04-18" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 19_99, date: "2026-05-18" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 19_99, date: "2026-06-18" },
  { name: "APPLE STORE", merchantName: "Apple", amount: 35_99, date: "2026-06-18" },
  { name: "APPLE.COM/BILL", merchantName: "Apple", amount: 5_99, date: "2026-06-06" },
];

// Odd 17-day cadence with only 3 txns: rejected before issue #44, now a
// valid suggestion (recall over precision — the user reviews it).
const oddCadence = [
  { name: "PODCAST APP", merchantName: "Podcast App", amount: 7_99, date: "2026-06-04" },
  { name: "PODCAST APP", merchantName: "Podcast App", amount: 7_99, date: "2026-06-21" },
  { name: "PODCAST APP", merchantName: "Podcast App", amount: 7_99, date: "2026-07-08" },
];

const all = [...netflix, ...noisy, ...gym, ...uber, ...gymSignup, ...loanJitter, ...rent, ...apple, ...oddCadence];
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

const gymSignupResult = results.find((r) => r.merchant === "Ironworks Gym");
assert(gymSignupResult, "gym with signup charge should be detected despite the outlier");
assert.strictEqual(gymSignupResult.cadence, "monthly", "gym should be monthly");
assert.strictEqual(gymSignupResult.amount, 34_99, "gym amount should be the regular charge");
assert.strictEqual(gymSignupResult.count, 3, "gym count should exclude the dropped outlier");

const loanJitterResult = results.find((r) => r.merchant === "LOANSERV");
assert(loanJitterResult, "loan payment should be detected despite gap jitter");

const rentResult = results.find((r) => r.merchant.startsWith("OAKS"));
assert(rentResult, "rent should group despite per-txn reference codes");
assert.strictEqual(rentResult.cadence, "monthly", "rent should be monthly");
assert.strictEqual(rentResult.count, 3, "rent should have 3 txns");

const appleSeries = results.filter((r) => r.merchant === "Apple");
assert.strictEqual(appleSeries.length, 2, "Apple should yield exactly two series (9.99 and 19.99)");
const appleAmounts = appleSeries.map((r) => r.amount).sort((a, b) => a - b);
assert.deepStrictEqual(appleAmounts, [9_99, 19_99], "Apple series should be the two subscriptions");

const oddResult = results.find((r) => r.merchant === "Podcast App");
assert(oddResult, "3-txn odd-cadence series should now be suggested");
assert.strictEqual(oddResult.cadence, "every ~17 days", "odd cadence should be ~17 days");

// --- partitionSeries: rules vs detected series ---

const rules: RecurringRule[] = [
  // Confirmed Netflix: matches the live series → removed from suggestions,
  // dates come from the detector.
  { id: 1, status: "confirmed", matchKey: "netflix", name: "Netflix", amount: 15_49, gapDays: 30, anchorDate: "2026-07-08" },
  // Dismissed Apple $9.99: suppresses that cluster, the $19.99 one stays.
  { id: 2, status: "dismissed", matchKey: "apple", name: "Apple", amount: 9_99, gapDays: 32, anchorDate: "2026-06-25" },
  // Manual annual rule with no matchKey: matches nothing, anchor rolls forward.
  { id: 3, status: "confirmed", matchKey: null, name: "Domain renewal", amount: 12_00, gapDays: 365, anchorDate: "2025-03-01" },
];

const { suggestions, nextDates } = partitionSeries(results, rules, today);

assert(!suggestions.some((s) => s.merchant === "Netflix"), "confirmed Netflix should leave suggestions");
const netflixDates = nextDates.get(1);
assert(netflixDates, "confirmed Netflix should get dates");
assert.strictEqual(netflixDates.lastDate, "2026-07-08", "live series supplies lastDate");
assert.strictEqual(netflixDates.nextDate, "2026-08-07", "live series supplies nextDate");

const appleSuggestions = suggestions.filter((s) => s.merchant === "Apple");
assert.strictEqual(appleSuggestions.length, 1, "dismissed 9.99 cluster suppressed, 19.99 remains");
assert.strictEqual(appleSuggestions[0].amount, 19_99, "remaining Apple suggestion is the 19.99 sub");
assert(!nextDates.has(2), "dismissed rules get no dates");

const manualDates = nextDates.get(3);
assert(manualDates, "manual rule should get dates");
assert.strictEqual(manualDates.lastDate, undefined, "manual rule has no live lastDate");
assert.strictEqual(manualDates.nextDate, "2027-03-01", "anchor rolls forward past today");

console.log("lib/recurring-check.ts: all assertions passed");
