// Plaid personal_finance_category primaries: the labels a transaction can be
// relabeled to. Kept to Plaid's set so budgets, spend rules and agents keep
// speaking one vocabulary.
export const CATEGORIES = [
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "HOME_IMPROVEMENT",
  "INCOME",
  "LOAN_DISBURSEMENTS",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "OTHER",
  "PERSONAL_CARE",
  "RENT_AND_UTILITIES",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSPORTATION",
  "TRAVEL",
] as const;

export function isCategory(v: unknown): v is string {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

// Key a merchant rule matches on: Plaid's merchant name, else the raw
// description, case-insensitive. Matched in JS, not SQL
// (SQLite lower() is ASCII-only).
export function merchantKey(merchantName: string | null, name: string): string {
  return (merchantName ?? name).trim().toLowerCase();
}
