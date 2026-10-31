This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Connect an agent (MCP)

Delta serves an MCP server at `/api/v1/mcp` (Streamable HTTP). Connecting an agent takes two steps on the Delta host:

1. `npm run token -- create <agent-name>` (add `--scope write` if the agent may set budgets, recurring rules and category relabels). It prints the token plus ready-to-paste MCP configs (Claude Code command, JSON for most clients, and an `mcp-remote` stdio bridge for clients that only run local servers), pointed at `DELTA_URL` from `.env`.
2. Paste one of them into the agent.

The tools carry Delta's finance conventions in their descriptions, return dollars, and attach an `as_of` block with stale-data warnings, so there is nothing else to install. The agent's machine must be on the tailnet.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
