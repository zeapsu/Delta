import assert from "node:assert";
import { createServer } from "node:http";
import { inspect } from "node:util";
import { PlaidClient, PlaidEnvironment } from "plaid";
import { plaidErrorCode, safePlaidError } from "./plaid-errors";

const CLIENT_ID = "check-client-id";
const SECRET = "check-secret-f3a9c1";
const TOKEN = "access-sandbox-check-7d21";

// A stand-in Plaid: answers each path with a fixed status and body, and
// records the auth headers the SDK sent.
const seen: Record<string, string | undefined>[] = [];
const server = createServer((req, res) => {
  seen.push({ id: req.headers["plaid-client-id"] as string, secret: req.headers["plaid-secret"] as string });
  req.resume();
  req.on("end", () => {
    if (req.url === "/item/get") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error_type: "ITEM_ERROR", error_code: "ITEM_LOGIN_REQUIRED", error_code_reason: null, request_id: "req-1" }));
    } else if (req.url === "/item/remove") {
      res.writeHead(502, { "content-type": "text/html" });
      res.end("<html>bad gateway</html>");
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ item_id: "i", access_token: TOKEN, request_id: "req-2" }));
    }
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const client = new PlaidClient({
    environment: PlaidEnvironment.Sandbox,
    baseUrl: `http://127.0.0.1:${port}`,
    clientId: CLIENT_ID,
    secret: SECRET,
  });

  // Keys go out as Plaid's auth headers.
  const ok = await client.item.exchangePublicToken({ public_token: "public-check" });
  assert.strictEqual(ok.access_token, TOKEN);
  assert.deepStrictEqual(seen[0], { id: CLIENT_ID, secret: SECRET });

  // A Plaid error: its code, reason and request id, and nothing that leaks.
  const plaidErr = await client.item.get({ access_token: TOKEN }).then(() => null, (e: unknown) => e);
  assert.ok(plaidErr);
  assert.strictEqual(plaidErrorCode(plaidErr), "ITEM_LOGIN_REQUIRED");
  assert.deepStrictEqual(safePlaidError(plaidErr), {
    error_code: "ITEM_LOGIN_REQUIRED",
    error_code_reason: null,
    request_id: "req-1",
  });
  const dump = inspect(plaidErr, { depth: 10 });
  assert.ok(!dump.includes(SECRET) && !dump.includes(TOKEN), "SDK errors must not carry the secret or access token");

  // A non-Plaid body (a gateway page): the HTTP status, no Plaid code.
  const gatewayErr = await client.item.remove({ access_token: TOKEN }).then(() => null, (e: unknown) => e);
  assert.strictEqual(plaidErrorCode(gatewayErr), undefined);
  assert.strictEqual(safePlaidError(gatewayErr).error_code, "HTTP_502");

  // Nothing listening: a network error, still no raw message.
  server.close();
  const offline = new PlaidClient({ environment: PlaidEnvironment.Sandbox, baseUrl: "http://127.0.0.1:1", clientId: CLIENT_ID, secret: SECRET });
  const netErr = await offline.item.get({ access_token: TOKEN }).then(() => null, (e: unknown) => e);
  assert.strictEqual(plaidErrorCode(netErr), undefined);
  assert.ok(safePlaidError(netErr).error_code, "network errors get a code");

  // Non-Plaid errors keep only their class name.
  assert.strictEqual(safePlaidError(new TypeError(`no such row ${TOKEN}`)).error_code, "TypeError");

  console.log("plaid-errors-check: ok");
}

main().catch((err) => {
  server.close();
  console.error(err);
  process.exit(1);
});
