import { readFileSync } from "node:fs";

export const TOKENS_FILE = "e2e/.tmp/tokens.json";
export const tokens = (): { read: string; write: string } => JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

// What the mock Plaid fixture (e2e/plaid-mock.mjs) adds up to this month.
export const THIS_MONTH = new Date().toISOString().slice(0, 7);
export const SPEND_THIS_MONTH_CENTS = 15_49 + 82_40 + 4_50; // Netflix + groceries + pending coffee
export const PENDING_THIS_MONTH_CENTS = 4_50;
export const MOCK_ACCESS_TOKEN = "access-sandbox-mock-1";
