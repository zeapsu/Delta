// Pure detection logic, no DB imports — see lib/recurring-check.ts for the self-check.
import { todayISO } from "@/lib/months";

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
  const todayDate = today ?? todayISO();

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
// UI renders, dismissed rows suppress re-detected suggestions, ended rows are
// archived (they suppress suggestions too, until a new charge revives them).
export type RecurringRule = {
  id: number;
  status: string; // "confirmed" | "dismissed" | "ended"
  matchKey: string | null;
  name: string;
  amount: number; // cents
  gapDays: number;
  anchorDate: string; // ISO yyyy-mm-dd
  reviewedOn?: string | null; // ISO day the user last said "still active" or "ended"
};

export type RuleState = "active" | "possiblyEnded" | "ended";

// Same width as the detector's amount clustering (1.1× the cluster minimum).
function amountsMatch(a: number, b: number): boolean {
  return a <= 1.1 * b && b <= 1.1 * a;
}

function matches(series: RecurringSeries, rule: RecurringRule): boolean {
  return rule.matchKey === series.matchKey && amountsMatch(series.amount, rule.amount);
}

// Latest charge per rule with a matchKey: same group key, amount within 10%.
// Read straight from the transactions, not the detector, so a skipped month
// (which breaks the detector's even-gap check) still shows when it last posted.
function lastCharges(txns: Txn[], rules: RecurringRule[]): Map<number, string> {
  const byKey = new Map<string, RecurringRule[]>();
  for (const r of rules) {
    if (r.matchKey === null) continue;
    const list = byKey.get(r.matchKey);
    if (list) list.push(r);
    else byKey.set(r.matchKey, [r]);
  }
  const last = new Map<number, string>();
  if (byKey.size === 0) return last;
  for (const t of txns) {
    const keyed = byKey.get(groupKey(t));
    if (!keyed) continue;
    for (const r of keyed) {
      if (amountsMatch(t.amount, r.amount) && t.date > (last.get(r.id) ?? "")) last.set(r.id, t.date);
    }
  }
  return last;
}

const later = (...dates: (string | null | undefined)[]) =>
  dates.reduce<string>((a, b) => (b && b > a ? b : a), "");

// Splits detected series into unreviewed suggestions (no rule matches) and
// per-rule dates and state. txns are the ones the series were detected from.
//
// Dates: a matching live series supplies lastDate/nextDate, unless the rule's
// anchor is newer than the series' last charge (the user or an agent moved
// the date): then the anchor drives nextDate until a charge on or after it
// posts. With no live series (manual adds, stale or uneven series) the later
// of the anchor and the last matching charge drives it. A date still ahead
// of today is the next date; one on or before today rolls forward by gapDays
// past today.
//
// State: a confirmed rule with a matchKey is "possiblyEnded" once about two
// expected charges are missed: nothing for 2 gaps (plus the detector's jitter
// tolerance) since the latest of its last charge, its anchor and the day the
// user last said it is still active. Manual rules can't be checked, so they
// stay active. An ended rule is active again once a charge posts after the
// day it was ended.
export function partitionSeries(
  series: RecurringSeries[],
  rules: RecurringRule[],
  today?: string,
  txns: Txn[] = [],
): {
  suggestions: RecurringSeries[];
  nextDates: Map<number, { lastDate?: string; nextDate: string }>;
  states: Map<number, RuleState>;
} {
  const todayDate = today ?? todayISO();

  const suggestions = series.filter((s) => !rules.some((r) => matches(s, r)));

  const charged = lastCharges(txns, rules);
  const nextDates = new Map<number, { lastDate?: string; nextDate: string }>();
  const states = new Map<number, RuleState>();
  for (const rule of rules) {
    if (rule.status !== "confirmed" && rule.status !== "ended") continue;
    const live = series.find((s) => matches(s, rule));
    const lastCharge = later(live?.lastDate, charged.get(rule.id)) || undefined;

    if (live && live.lastDate >= rule.anchorDate) {
      nextDates.set(rule.id, { lastDate: live.lastDate, nextDate: live.nextDate });
    } else {
      // Whole periods to step past today, computed rather than looped: an
      // anchor years back with a one-day gap would loop for every one of them.
      const base = live ? rule.anchorDate : later(rule.anchorDate, lastCharge);
      const behind = daysBetween(base, todayDate);
      const next = behind < 0 ? base : addDays(base, (Math.floor(behind / rule.gapDays) + 1) * rule.gapDays);
      nextDates.set(rule.id, lastCharge ? { lastDate: lastCharge, nextDate: next } : { nextDate: next });
    }

    const reviewed = rule.reviewedOn ?? rule.anchorDate;
    if (rule.status === "ended" && !(lastCharge && lastCharge > reviewed)) {
      states.set(rule.id, "ended");
      continue;
    }
    let state: RuleState = "active";
    if (rule.matchKey !== null) {
      const seen = later(lastCharge, rule.anchorDate, rule.status === "confirmed" ? rule.reviewedOn : null);
      if (daysBetween(seen, todayDate) > 2 * rule.gapDays + Math.max(3, 0.3 * rule.gapDays)) state = "possiblyEnded";
    }
    states.set(rule.id, state);
  }

  return { suggestions, nextDates, states };
}
