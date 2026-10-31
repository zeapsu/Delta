import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { TOKENS_FILE } from "./helpers";

// Seeds the fresh DB the way a real install does: link (mock Plaid) through
// the exchange route, which runs the first sync, then mint API tokens with
// the CLI agents are onboarded with.
test("link a bank, sync, create tokens", async ({ request }) => {
  const res = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock", institution_name: "Mock Bank" },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const create = (name: string, scope: string) => {
    const out = execFileSync("npx", ["tsx", "scripts/api-token.ts", "create", name, "--scope", scope], {
      encoding: "utf8",
    });
    expect(out).toContain("/api/v1/mcp"); // paste-ready MCP config
    return out.match(/dlt_[A-Za-z0-9_-]+/)![0];
  };
  writeFileSync(TOKENS_FILE, JSON.stringify({ read: create("e2e-read", "read"), write: create("e2e-write", "write") }));
});
