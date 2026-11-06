// Pure detection logic, no DB imports — see lib/recurring-check.ts for the self-check.

export type RecurringSeries = {
  merchant: string; // display name (most common original merchantName ?? cleaned name in group)
  matchKey: string; // group key — pairs a series with a recurring_rules row
  amount: number; // median amount, cents
  cadence: string; // display only: "weekly" | "biweekly" | ... | "every ~N days"
  gapDays: number; // median gap between charges, days
  lastDate: string; // ISO yyyy-mm-dd
  nextDate: string; // ISO yyyy-mm-dd
  count: number;
};

type Txn = { name: string; merchantName: string | null; amount: number; date: string };

// Drop whole tokens containing digits: bank payment names embed a unique
// reference code each time ("... ST-A7R5F7J5A2P7 ..."), so stripping digits
// in place leaves different letter residue per txn and the series never
// groups. Fallback to in-place digit-stripping for names that are all
// digit-tokens ("7-Eleven").
function dropDigitTokens(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((w) => !/\d/.test(w))
    .join(" ")
    .trim();
}

function groupKey(t: Txn): string {
  const raw = (t.merchantName ?? t.name).toLowerCase();
  return dropDigitTokens(raw) || raw.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
}

// Fallback display name when merchantName is null: same cleanup, original casing.
function cleanName(raw: string): string {
  return dropDigitTokens(raw) || raw.replace(/\d+/g, "").replace(/\s+/g, " ").trim() || raw;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function daysBetween(a: string, b: string): number {
  return (Date.UTC(...parseISO(b)) - Date.UTC(...parseISO(a))) / 86_400_000;
}

function parseISO(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m - 1, day];
}

function addDays(date: string, days: number): string {
  const [y, m, d] = parseISO(date);
  const ms = Date.UTC(y, m, d) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function cadenceFromGap(m: number): string {
  if (m >= 6 && m <= 8) return "weekly";
  if (m >= 13 && m <= 16) return "biweekly";
  if (m >= 27 && m <= 32) return "monthly";
  if (m >= 84 && m <= 95) return "quarterly";
  if (m >= 350 && m <= 380) return "yearly";
  return `every ~${Math.round(m)} days`;
}

// ponytail: naive heuristic over full history; upgrade path is Plaid
// /transactions/recurring/get if this proves too noisy in practice.
export function detectRecurring(txns: Txn[], today?: string): RecurringSeries[] {
  const todayDate = today ?? new Date().toISOString().slice(0, 10);

  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const key = groupKey(t);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const results: RecurringSeries[] = [];

  // A merchant can mix several subscriptions with one-off purchases (Apple:
  // $9.99/mo + $19.99/mo + store buys) or a one-off signup charge with the
  // regular bill — so cluster each merchant's txns by amount (new cluster
  // when an amount exceeds 110% of the cluster minimum) and run the cadence
  // checks per cluster.
  const clusters: { key: string; txns: Txn[] }[] = [];
  for (const [key, group] of groups) {
    const byAmount = [...group].sort((a, b) => a.amount - b.amount);
    let cluster: Txn[] = [];
    for (const t of byAmount) {
      if (cluster.length > 0 && t.amount > 1.1 * cluster[0].amount) {
        clusters.push({ key, txns: cluster });
        cluster = [];
      }
      cluster.push(t);
    }
    clusters.push({ key, txns: cluster });
  }

  for (const { key, txns: group } of clusters) {
    if (group.length < 3) continue;

    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    const m = median(gaps);
    if (m < 5) continue;

    // 0.3 (was 0.25): real payments jitter — a monthly bill paid 8 days early
    // one month reads as gaps of ~22 and ~39 days.
    const gapTolerance = Math.max(3, 0.3 * m);
    const gapsOk = gaps.every((g) => Math.abs(g - m) <= gapTolerance);
    if (!gapsOk) continue;

    // No ≥4-occurrence guard for odd cadences: results are suggestions the
    // user reviews, so recall beats precision — a false positive costs one
    // click (issue #44).
    const cadence = cadenceFromGap(m);

    const lastDate = sorted[sorted.length - 1].date;
    const nextDate = addDays(lastDate, m);

    if (daysBetween(lastDate, todayDate) > 2 * m) continue;

    // Display name: most common merchantName ?? cleaned name in group.
    const nameCounts = new Map<string, number>();
    for (const t of sorted) {
      const display = t.merchantName ?? cleanName(t.name);
      nameCounts.set(display, (nameCounts.get(display) ?? 0) + 1);
    }
    let merchant = sorted[0].merchantName ?? cleanName(sorted[0].name);
    let bestCount = 0;
    for (const [name, count] of nameCounts) {
      if (count > bestCount) {
        bestCount = count;
        merchant = name;
      }
    }

    results.push({
      merchant,
      matchKey: key,
      amount: median(sorted.map((t) => t.amount)),
      cadence,
      gapDays: m,
      lastDate,
      nextDate,
      count: sorted.length,
    });
  }

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// A recurring_rules row (see db/schema.ts); confirmed rows are the truth the
// UI renders, dismissed rows suppress re-detected suggestions.
export type RecurringRule = {
  id: number;
  status: string; // "confirmed" | "dismissed"
  matchKey: string | null;
  name: string;
  amount: number; // cents
  gapDays: number;
  anchorDate: string; // ISO yyyy-mm-dd
};

// Same width as the detector's amount clustering (1.1× the cluster minimum).
function amountsMatch(a: number, b: number): boolean {
  return a <= 1.1 * b && b <= 1.1 * a;
}

function matches(series: RecurringSeries, rule: RecurringRule): boolean {
  return rule.matchKey === series.matchKey && amountsMatch(series.amount, rule.amount);
}

// Splits detected series into unreviewed suggestions (no rule matches) and
// per-confirmed-rule dates. A matching live series supplies lastDate/nextDate,
// unless the rule's anchor is newer than the series' last charge (the user or
// an agent moved the date): then the anchor drives nextDate until a charge on
// or after it posts. With no live series (manual adds, stale series) the
// anchor drives it too. An anchor still ahead of today is the next date;
// one on or before today rolls forward by gapDays past today.
export function partitionSeries(
  series: RecurringSeries[],
  rules: RecurringRule[],
  today?: string,
): {
  suggestions: RecurringSeries[];
  nextDates: Map<number, { lastDate?: string; nextDate: string }>;
} {
  const todayDate = today ?? new Date().toISOString().slice(0, 10);

  const suggestions = series.filter((s) => !rules.some((r) => matches(s, r)));

  const nextDates = new Map<number, { lastDate?: string; nextDate: string }>();
  for (const rule of rules) {
    if (rule.status !== "confirmed") continue;
    const live = series.find((s) => matches(s, rule));
    if (live && live.lastDate >= rule.anchorDate) {
      nextDates.set(rule.id, { lastDate: live.lastDate, nextDate: live.nextDate });
    } else {
      let next = rule.anchorDate;
      while (next <= todayDate) next = addDays(next, rule.gapDays);
      nextDates.set(rule.id, live ? { lastDate: live.lastDate, nextDate: next } : { nextDate: next });
    }
  }

  return { suggestions, nextDates };
}
