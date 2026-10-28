// Manage /api/v1 tokens. Run on the machine that holds the DB:
//   npm run token -- create <name> [--scope read|write]   (default read)
//   npm run token -- list
//   npm run token -- revoke <id>
// The token is printed once at creation; only its hash is stored.
import { createToken, listTokens, revokeToken } from "../lib/api-tokens";

const [cmd, ...args] = process.argv.slice(2);

async function main() {
  if (cmd === "create") {
    const name = args.find((a) => !a.startsWith("--"));
    const scopeIdx = args.indexOf("--scope");
    const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : "read";
    if (!name || (scope !== "read" && scope !== "write")) {
      throw new Error("usage: create <name> [--scope read|write]");
    }
    const { id, token } = await createToken(name, scope);
    console.log(`created token ${id} "${name}" (${scope}). Copy it now, it is not shown again:\n\n${token}\n`);
  } else if (cmd === "list") {
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "-");
    for (const t of await listTokens()) {
      const state = t.revokedAt ? `revoked ${fmt(t.revokedAt)}` : "active";
      console.log(`${t.id}\t${t.prefix}…\t${t.scope}\t${t.name}\tlast used ${fmt(t.lastUsedAt)}\t${state}`);
    }
  } else if (cmd === "revoke") {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) throw new Error("usage: revoke <id>");
    console.log((await revokeToken(id)) ? `revoked token ${id}` : `no active token ${id}`);
  } else {
    throw new Error("usage: api-token create <name> [--scope read|write] | list | revoke <id>");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
