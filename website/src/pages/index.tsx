import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useBrokenLinks from "@docusaurus/useBrokenLinks";
import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";
import styles from "./index.module.css";

// Landing page. The mock dashboard reuses the app's materials (.glass nav
// pill, .surface cards) and its meaning-only color: category slots, money
// in/out and over-budget red. All numbers are sample data.

const NAV = ["Overview", "Spending", "Transactions", "Budgets", "Recurring", "Net worth"];

const CATEGORIES = [
  { name: "Food and drink", amount: 612, color: "var(--chart-1)" },
  { name: "Rent and utilities", amount: 540, color: "var(--chart-2)" },
  { name: "Transportation", amount: 286, color: "var(--chart-3)" },
  { name: "Shopping", amount: 241, color: "var(--chart-5)" },
  { name: "Entertainment", amount: 163, color: "var(--chart-6)" },
];
const MAX = Math.max(...CATEGORIES.map((c) => c.amount));

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.heroInner}>
        <Link to="/docs/one-click-install" className={styles.badge}>
          <span className={styles.badgeTag}>New</span>
          One-click install, no terminal
          <span aria-hidden>→</span>
        </Link>
        <p className={styles.platforms}>Self-hosted · Docker on amd64 and arm64 · AGPL-3.0</p>
        <h1 className={styles.title}>
          Your money,
          <br />
          on your machine.
        </h1>
        <p className={styles.subtitle}>
          Delta links your banks, cards and brokerage through Plaid, keeps everything in a SQLite file on hardware you own, and lets the agent you already use read the same numbers the dashboard shows.
        </p>
        <div className={styles.actions}>
          <Link className="btn btn-primary" to="/#install">
            Get started
          </Link>
          <Link className="btn" to="/docs">
            Read the docs
          </Link>
        </div>
      </div>
      <Preview />
    </header>
  );
}

function Preview() {
  return (
    <div className={styles.preview} aria-label="Sample Delta dashboard" role="img">
      <div className={styles.previewNav}>
        <span className={styles.mark}>Δ</span>
        <span className={`glass ${styles.pill}`}>
          {NAV.map((n, i) => (
            <span key={n} className={i === 0 ? styles.pillActive : styles.pillItem}>
              {n}
            </span>
          ))}
        </span>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.stats}>
          <Stat label="Net worth" value="$48,210" change="+$1,320 this month" tone="positive" />
          <Stat label="Spent this month" value="$1,842" change="$96 pending" />
          <Stat label="Cash flow" value="+$1,260" change="In $3,102 · Out $1,842" tone="positive" />
        </div>
        <div className={styles.previewCols}>
          <div className={`surface ${styles.card}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Spending by category</span>
              <span className={styles.ask}>Ask</span>
            </div>
            <ul className={styles.bars}>
              {CATEGORIES.map((c) => (
                <li key={c.name}>
                  <span className={styles.barLabel}>
                    <span className={styles.dot} style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <span className={styles.barTrack}>
                    <span className={styles.bar} style={{ width: `${(c.amount / MAX) * 100}%`, background: c.color }} />
                  </span>
                  <span className={styles.barValue}>${c.amount}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`surface ${styles.card} ${styles.agent}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Your agent</span>
              <span className={styles.eyebrow}>via MCP</span>
            </div>
            <p className={styles.bubbleUser}>Am I spending more on food than usual?</p>
            <p className={styles.tool}>
              <span className={styles.toolDot} />
              spending_by_category · 4 months
            </p>
            <p className={styles.bubbleAgent}>
              Food and drink is <strong>$612</strong> so far, <span className={styles.out}>31% above</span> your 3-month average of $467. Most of the jump is dining out in the last two weeks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, change, tone }: { label: string; value: string; change: string; tone?: "positive" }) {
  return (
    <div className={`surface ${styles.stat}`}>
      <span className={styles.eyebrow}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={tone === "positive" ? styles.positive : styles.muted}>{change}</span>
    </div>
  );
}

function Feature({ label, title, children, visual, flip }: { label: string; title: string; children: ReactNode; visual: ReactNode; flip?: boolean }) {
  return (
    <section className={`${styles.feature} ${flip ? styles.flip : ""}`}>
      <div className={styles.featureText}>
        <span className={styles.eyebrow}>{label}</span>
        <h3>{title}</h3>
        {children}
      </div>
      <div className={styles.featureVisual}>{visual}</div>
    </section>
  );
}

function BudgetsVisual() {
  const rows = [
    { name: "Groceries", spent: 412, budget: 500 },
    { name: "Dining out", spent: 286, budget: 250 },
    { name: "Transportation", spent: 118, budget: 200 },
  ];
  return (
    <div className={`surface ${styles.card}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Budgets · October</span>
        <span className={styles.ask}>Ask</span>
      </div>
      <ul className={styles.meters}>
        {rows.map((r) => {
          const over = r.spent > r.budget;
          const pct = Math.min(100, (r.spent / r.budget) * 100);
          return (
            <li key={r.name}>
              <span className={styles.meterTop}>
                <span>{r.name}</span>
                <span className={over ? styles.negative : styles.muted}>
                  ${r.spent} of ${r.budget}
                  {over ? " · over" : ""}
                </span>
              </span>
              <span className={styles.meterTrack}>
                <span className={styles.meter} style={{ width: `${pct}%`, background: over ? "var(--negative)" : "var(--foreground)" }} />
              </span>
            </li>
          );
        })}
      </ul>
      <div className={styles.recurring}>
        <span className={styles.eyebrow}>Looks recurring</span>
        <span className={styles.recurringRow}>
          <span>Streaming service · $15.49 monthly</span>
          <span className={styles.chips}>
            <span className={styles.chipInk}>Confirm</span>
            <span className={styles.chip}>Dismiss</span>
          </span>
        </span>
      </div>
    </div>
  );
}

const MCP_CONFIG = `{
  "mcpServers": {
    "delta": {
      "type": "http",
      "url": "http://100.x.y.z:3000/api/v1/mcp",
      "headers": { "Authorization": "Bearer dlt_…" }
    }
  }
}`;

function AgentVisual() {
  const tools = ["get_status", "spending_by_category", "search_transactions", "cash_flow", "get_budgets", "get_recurring", "get_net_worth"];
  return (
    <div className={styles.stack}>
      <CodeBlock language="json" title="Printed by npm run token -- create my-agent">
        {MCP_CONFIG}
      </CodeBlock>
      <div className={styles.toolChips}>
        {tools.map((t) => (
          <span key={t} className={styles.chip}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

const TERMINAL = `docker compose up -d
# the app, plus a jobs container that syncs every 6h
# and backs up daily

docker compose exec delta npm run token -- create my-agent
# prints the token and a ready-to-paste MCP config`;

function HostVisual() {
  return (
    <div className={styles.stack}>
      <CodeBlock language="bash" title="On your server">
        {TERMINAL}
      </CodeBlock>
      <div className={`surface ${styles.card} ${styles.connections}`}>
        <span className={styles.connection}>
          <span className={styles.statusDot} style={{ background: "var(--positive)" }} />
          Checking · synced 2h ago
        </span>
        <span className={styles.connection}>
          <span className={styles.statusDot} style={{ background: "var(--positive)" }} />
          Credit card · synced 2h ago
        </span>
        <span className={styles.connection}>
          <span className={styles.statusDot} style={{ background: "var(--warning)" }} />
          Brokerage · retrying
        </span>
      </div>
    </div>
  );
}

const PANELS = ["Portainer", "CasaOS", "Dockge", "Synology", "Unraid"];
const INSTALL_CMD = "curl -fsSL https://raw.githubusercontent.com/zeapsu/Delta/main/delta.sh | bash -s install";

// A miniature of the app's /setup page: the step a panel install ends with.
function SetupVisual() {
  return (
    <div className={`surface ${styles.card} ${styles.setupMock}`} aria-hidden>
      <span className={styles.cardTitle}>Set up Delta</span>
      <span className={styles.segment}>
        <span className={styles.segmentOn}>Sandbox</span>
        <span className={styles.segmentOff}>Production</span>
      </span>
      <span className={styles.mockField}>
        <span className={styles.eyebrow}>client_id</span>
        <span className={styles.mockInput}>5f3e…a91c</span>
      </span>
      <span className={styles.mockField}>
        <span className={styles.eyebrow}>Sandbox secret</span>
        <span className={styles.mockInput}>••••••••••••••••</span>
      </span>
      <span className={styles.mockRow}>
        <span className={styles.chipInk}>Check and save</span>
        <span className={styles.mockOk}>
          <span className={styles.statusDot} style={{ background: "var(--positive)" }} />
          Plaid accepted the keys
        </span>
      </span>
    </div>
  );
}

function Install() {
  // A plain section id; tell the broken-anchor check it exists.
  useBrokenLinks().collectAnchor("install");
  return (
    <section id="install" className={styles.section}>
      <h2 className={styles.sectionTitle}>Install it your way</h2>
      <div className={styles.installGrid}>
        <div className={`surface ${styles.installCard}`}>
          <span className={styles.eyebrow}>No terminal</span>
          <h3>One click in your app panel</h3>
          <p>
            Paste one compose file into your server&apos;s app panel, open Delta, and enter your Plaid keys in the browser. Nothing to edit by hand.
          </p>
          <span className={styles.chips}>
            {PANELS.map((p) => (
              <span key={p} className={styles.chip}>
                {p}
              </span>
            ))}
          </span>
          <SetupVisual />
          <Link className={styles.installLink} to="/docs/one-click-install">
            One-click install guide <span aria-hidden>→</span>
          </Link>
        </div>
        <div className={`surface ${styles.installCard}`}>
          <span className={styles.eyebrow}>Terminal</span>
          <h3>One command</h3>
          <p>
            Downloads Delta, asks for your Plaid keys (or skip them and use the browser), finds your Tailscale address and starts it. The same script updates and uninstalls.
          </p>
          <div className={styles.stack}>
            <CodeBlock language="bash" title="On your server">
              {INSTALL_CMD}
            </CodeBlock>
            <CodeBlock language="bash" title="Later, from the delta folder">
              {"./delta.sh update\n./delta.sh uninstall"}
            </CodeBlock>
          </div>
          <Link className={styles.installLink} to="/docs/self-hosting">
            Self-hosting guide <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Get Plaid keys", body: "Plaid's free Trial plan connects real US and Canadian accounts.", to: "/docs/plaid-trial" },
  { title: "Run Delta", body: "One click in your app panel, or one command in a terminal, on any always-on machine.", to: "/#install" },
  { title: "Link your accounts", body: "Plaid Link in your browser. Sync runs on its own every 6 hours.", to: "/docs/self-hosting#4-link-your-accounts" },
  { title: "Connect your agent", body: "Create a token, paste the printed MCP config, start asking.", to: "/docs/agents" },
];

export default function Home(): ReactNode {
  return (
    <Layout title="Self-hosted personal finance" description="A self-hosted personal finance dashboard your own agent can talk to">
      <main className={styles.page}>
        <Hero />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What Delta does</h2>
          <Feature label="Dashboard" title="See where it goes" visual={<BudgetsVisual />}>
            <p>
              Net worth, spending by category, cash flow, budgets, recurring charges and investments, with pending charges called out. Relabel a transaction, or every transaction from a merchant, and every view follows.
            </p>
          </Feature>
          <Feature label="Agents" title="Ask the agent you already use" visual={<AgentVisual />} flip>
            <p>
              Delta has no chatbot of its own. Its MCP server gives Claude, Cursor or any MCP client the same numbers the dashboard shows, along with how to read them. Read tokens only look; write tokens can also set budgets and confirm recurring charges.
            </p>
            <p>
              Every card has an <strong>Ask</strong> button that copies what it shows as a prompt.
            </p>
          </Feature>
          <Feature label="Privacy" title="Stored on your hardware" visual={<HostVisual />}>
            <p>
              One SQLite file on a machine you control, reachable only on your private network. Plaid access tokens never leave the database, and backups run daily.
            </p>
          </Feature>
        </section>

        <section className={`${styles.section} ${styles.cost}`}>
          <span className={styles.eyebrow}>What it costs</span>
          <p className={styles.price}>$0</p>
          <p className={styles.costText}>
            Delta is free and open source under the AGPL-3.0. For personal use, Plaid's Trial plan is free too, for up to 10 bank logins.
          </p>
        </section>

        <Install />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Up and running in four steps</h2>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Link to={s.to} className={`surface ${styles.step}`}>
                  <span className={styles.stepNum}>
                    {String(i + 1).padStart(2, "0")} <span className={styles.muted}>/ 04</span>
                  </span>
                  <span className={styles.stepTitle}>{s.title}</span>
                  <span className={styles.stepBody}>{s.body}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.cta}`}>
          <h2 className={styles.ctaTitle}>Run your own Delta</h2>
          <div className={styles.actions}>
            <Link className="btn btn-primary" to="/docs/one-click-install">
              One-click install
            </Link>
            <Link className="btn" to="/docs/self-hosting">
              Self-hosting guide
            </Link>
            <Link className="btn" href="https://github.com/zeapsu/Delta">
              View on GitHub
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
