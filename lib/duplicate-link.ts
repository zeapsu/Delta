// Is a bank the user just linked one Delta already has? Plaid hands every
// link a new item and new account ids, so nothing in the ids says so, and a
// second copy doubles the balances and every transaction (and is billed
// again). Plaid's advice is to compare the institution and each account's
// mask and name, which is what this does. Pure; self-check: duplicate-link-check.ts.
import { GONE_ERROR_CODES } from "./plaid-errors";

export type LinkedAccount = { name: string; type: string; subtype: string | null; mask: string | null };
export type LinkedBank = { institution: string | null; accounts: LinkedAccount[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// An unknown name (linked without one) could be any bank, so it never rules a
// match out; the accounts decide.
function sameInstitution(a: string | null, b: string | null): boolean {
  return !norm(a) || !norm(b) || norm(a) === norm(b);
}

// The last digits identify an account within a bank. Names don't (people
// rename accounts), so they only stand in when a bank reports no mask.
export function sameAccount(a: LinkedAccount, b: LinkedAccount): boolean {
  if (norm(a.type) !== norm(b.type) || norm(a.subtype) !== norm(b.subtype)) return false;
  if (a.mask && b.mask) return a.mask === b.mask;
  return !a.mask && !b.mask && norm(a.name) === norm(b.name);
}

// The connection that already holds one of the new link's accounts, if any.
// A second login at the same bank with other accounts (a partner's, a
// business login) is not a duplicate and returns undefined. Neither is a
// connection Plaid no longer has: linking again is the only way back for it.
export function duplicateOf<T extends LinkedBank & { lastErrorCode?: string | null }>(
  next: LinkedBank,
  existing: T[],
): T | undefined {
  return existing.find(
    (bank) =>
      !GONE_ERROR_CODES.has(bank.lastErrorCode ?? "") &&
      sameInstitution(bank.institution, next.institution) &&
      bank.accounts.some((have) => next.accounts.some((a) => sameAccount(have, a))),
  );
}
