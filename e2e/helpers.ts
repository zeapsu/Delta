import { readdirSync, readFileSync } from "node:fs";

export const TOKENS_FILE = "e2e/.tmp/tokens.json";
export const tokens = (): { read: string; write: string } => JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

// What the mock Plaid fixture (e2e/plaid-mock.mjs) adds up to this month.
export const THIS_MONTH = new Date().toISOString().slice(0, 7);
export const SPEND_THIS_MONTH_CENTS = 15_49 + 82_40 + 4_50; // Netflix + groceries + pending coffee
export const PENDING_THIS_MONTH_CENTS = 4_50;
export const MOCK_ACCESS_TOKEN = "access-sandbox-mock-1";
export const MOCK_PLAID_URL = "http://127.0.0.1:4010";

// Every route under app/api as the URL it answers ([id] becomes 1), read from
// the source tree so a new route is covered by the guard tests without being
// listed anywhere.
export function apiRoutes(dir = "app/api", url = "/api"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? apiRoutes(`${dir}/${e.name}`, `${url}/${e.name.replace(/^\[.*\]$/, "1")}`)
      : e.name === "route.ts"
        ? [url]
        : [],
  );
}
