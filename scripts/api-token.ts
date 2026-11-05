// Manage /api/v1 tokens. Run on the machine that holds the DB:
//   npm run token -- create <name> [--scope read|write]   (default read)
//   npm run token -- list
//   npm run token -- revoke <id>
// The token is printed once at creation; only its hash is stored. create also
// prints a ready-to-paste MCP config, pointed at DELTA_URL from .env.

// .env first (DATABASE_PATH, DELTA_URL), before db/index.ts reads it; values
// already in the environment win.
try {
  process.loadEnvFile();
} catch {}

const [cmd, ...args] = process.argv.slice(2);

async function mcpConfig(token: string): Promise<string> {
  const { agentConfigs, mcpUrl } = await import("../lib/agent-config");
  const base = process.env.DELTA_URL ?? "http://localhost:3000";
  return [
    `Connect an agent over MCP (Streamable HTTP): ${mcpUrl(base)}`,
    `with the header  Authorization: Bearer ${token}`,
    ...agentConfigs(base, token).flatMap((c) => ["", `${c.label} (${c.hint.replace(/\.$/, "")}):`, c.text]),
  ].join("\n");
}

async function main() {
  const { createToken, listTokens, revokeToken } = await import("../lib/api-tokens");
  if (cmd === "create") {
    const name = args.find((a) => !a.startsWith("--"));
    const scopeIdx = args.indexOf("--scope");
    const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : "read";
    if (!name || (scope !== "read" && scope !== "write")) {
      throw new Error("usage: create <name> [--scope read|write]");
    }
    const { id, token } = await createToken(name, scope);
    console.log(`created token ${id} "${name}" (${scope}). Copy it now, it is not shown again:\n\n${token}\n`);
    console.log(`${await mcpConfig(token)}\n`);
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
