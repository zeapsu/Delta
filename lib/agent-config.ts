// Ready-to-paste MCP configs for a new token, shared by the token CLI
// (scripts/api-token.ts) and Settings → Agents. Pure, so the page can build
// them in the browser from the token it just received.

export type AgentConfig = { id: string; label: string; hint: string; text: string };

export function mcpUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/api/v1/mcp`;
}

export function agentConfigs(base: string, token: string): AgentConfig[] {
  const url = mcpUrl(base);
  const auth = `Bearer ${token}`;
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "Run in a terminal.",
      text: `claude mcp add --transport http delta ${url} --header "Authorization: ${auth}"`,
    },
    {
      id: "json",
      label: "JSON config",
      hint: "Most MCP clients (Cursor, OpenBot, …).",
      text: json({ mcpServers: { delta: { type: "http", url, headers: { Authorization: auth } } } }),
    },
    {
      id: "stdio",
      label: "stdio only",
      hint: "Clients that only run local servers. Needs Node (npx).",
      text: json({
        mcpServers: {
          delta: { command: "npx", args: ["-y", "mcp-remote", url, "--allow-http", "--header", `Authorization:${auth}`] },
        },
      }),
    },
  ];
}

// Token names: what the person calls the agent. Shown in the list only.
export function parseTokenName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// Token management is for the person at the dashboard. A request carrying a
// token is an agent, and agents don't mint or revoke tokens.
export function sentByAgent(req: Request): boolean {
  return req.headers.has("authorization");
}
