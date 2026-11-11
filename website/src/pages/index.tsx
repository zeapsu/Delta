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
  // Same pinned hues as the app (lib/colors.ts): no category wears the green or red that mean money in / over budget.
  { name: "Food and drink", amount: 612, color: "var(--chart-3)" },
  { name: "Rent and utilities", amount: 540, color: "var(--chart-1)" },
  { name: "Transportation", amount: 286, color: "var(--chart-5)" },
  { name: "Shopping", amount: 241, color: "var(--chart-7)" },
  { name: "Entertainment", amount: 163, color: "var(--chart-8)" },
];
const MAX = Math.max(...CATEGORIES.map((c) => c.amount));

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.grid} aria-hidden />
      <div className={styles.heroInner}>
        <Link to="/docs/home-server" className={styles.badge}>
          <span className={styles.badgeTag}>New</span>
          Install from your app panel
          <span aria-hidden>→</span>
        </Link>
        <h1 className={styles.title}>
          Your money,
          <br />
          on your machine.
        </h1>
        <p className={styles.subtitle}>
          Banks, cards and brokerage through Plaid. Stored on hardware you own. Readable by the agent you already use.
        </p>
        <div className={styles.actions}>
          <Link className="btn btn-primary" to="/#install">
            Get started
          </Link>
          <Link className="btn" to="/docs">
            Read the docs
          </Link>
        </div>
        <p className={styles.platforms}>Free and open source · Docker or Homebrew</p>
      </div>
      <Preview />
    </header>
  );
}

function Preview() {
  return (
    <div className={styles.preview} aria-label="Sample Delta dashboard" role="img">
      <div className={styles.previewNav}>
        <span className={`glass ${styles.mark}`} />
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
          <Stat label="This month" value="$1,842" change="$96 pending" />
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
          <div className={`glass ${styles.card} ${styles.agent}`}>
            <div className={styles.cardHead}>
              <span className={styles.windowDots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
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
      <Phone />
    </div>
  );
}

// The same dashboard as a home-screen app. Drawn at phone size and scaled
// down in CSS, so it reads like the app's phone layout: stacked cards and the
// glass tab bar (icons copied from app/nav.tsx). Hidden below the desktop
// layout, where the preview is already phone-sized. Colors go through
// `style`, since var() is not valid in an SVG presentation attribute.
const TABS = [
  { label: "Overview", icon: <path d="M4 11.5 12 5l8 6.5M6.5 10v8.5h11V10" /> },
  {
    label: "Spending",
    icon: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 4.5V12l5.5 5" />
      </>
    ),
  },
  { label: "Transactions", icon: <path d="M5 7.5h14M5 12h14M5 16.5h9" /> },
  {
    label: "Budgets",
    icon: (
      <>
        <path d="M5 18.5h14" />
        <path d="M7.5 15v-4M12 15V6.5M16.5 15V9" />
      </>
    ),
  },
  {
    label: "More",
    icon: (
      <>
        <circle cx="6" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="18" cy="12" r="1.2" />
      </>
    ),
  },
];

function Phone() {
  return (
    <div className={styles.phone} aria-hidden>
      <div className={styles.phoneScreen}>
        <div className={styles.phoneUi}>
          <span className={styles.island} />
          <div className={styles.phoneHead}>
            <span>
              <span className={styles.phoneTitle}>Good evening, Sam</span>
              <span className={styles.eyebrow}>Synced 2h ago</span>
            </span>
            <span className={styles.ask}>Ask Agent</span>
          </div>
          <div className={`surface ${styles.phoneCard}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Net worth</span>
              <span className={styles.ask}>Ask</span>
            </div>
            <span className={styles.phoneValue}>$48,210</span>
            <span className={styles.positive}>+$1,320 this month</span>
            <svg className={styles.spark} viewBox="0 0 280 72" preserveAspectRatio="none">
              <defs>
                <linearGradient id="phone-spark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: "var(--positive)" }} stopOpacity="0.22" />
                  <stop offset="1" style={{ stopColor: "var(--positive)" }} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 62C30 60 42 50 66 48s34 6 58-6 30-10 52-14 34-4 54-14 30-12 50-18V72H0Z" fill="url(#phone-spark)" />
              <path d="M0 62C30 60 42 50 66 48s34 6 58-6 30-10 52-14 34-4 54-14 30-12 50-18" fill="none" style={{ stroke: "var(--positive)" }} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className={`surface ${styles.phoneCard}`}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>This month</span>
              <span className={styles.ask}>Ask</span>
            </div>
            <span className={styles.phoneValue}>$1,842</span>
            <ul className={styles.phoneBars}>
              {CATEGORIES.slice(0, 4).map((c) => (
                <li key={c.name}>
                  <span className={styles.meterTop}>
                    <span>{c.name}</span>
                    <span>${c.amount}</span>
                  </span>
                  <span className={styles.barTrack}>
                    <span className={styles.bar} style={{ width: `${(c.amount / MAX) * 100}%`, background: c.color }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`glass ${styles.tabBar}`}>
            {TABS.map((t, i) => (
              <span key={t.label} className={i === 0 ? styles.tabActive : styles.tab}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon}
                </svg>
                {t.label}
              </span>
            ))}
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
      <CodeBlock language="json" title="Settings → Agents → Create token">
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
# and backs up daily`;

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

const PANELS = ["Portainer", "CasaOS", "Dockge", "Synology", "Unraid", "TrueNAS"];
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
        <span className={styles.chipInk}>Save</span>
        <span className={styles.mockOk}>
          <span className={styles.statusDot} style={{ background: "var(--positive)" }} />
          Saved
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
        <div className={`surface ${styles.installCard} ${styles.installTall}`}>
          <span className={styles.eyebrow}>Home server app</span>
          <h3>From your app panel</h3>
          <p>
            Paste one file. A browser checklist takes it from Plaid keys to synced accounts.
          </p>
          <span className={styles.chips}>
            {PANELS.map((p) => (
              <span key={p} className={styles.chip}>
                {p}
              </span>
            ))}
          </span>
          <SetupVisual />
          <Link className={styles.installLink} to="/docs/home-server">
            Home server guide <span aria-hidden>→</span>
          </Link>
        </div>
        <div className={`surface ${styles.installCard}`}>
          <span className={styles.eyebrow}>Terminal</span>
          <h3>From a shell</h3>
          <p>
            Installs, starts Delta and opens it. <code>./delta.sh</code> then updates, adds your phone or uninstalls.
          </p>
          <div className={styles.stack}>
            <CodeBlock language="bash" title="On your server">
              {INSTALL_CMD}
            </CodeBlock>
          </div>
          <Link className={styles.installLink} to="/docs/self-hosting#terminal-install">
            Terminal guide <span aria-hidden>→</span>
          </Link>
        </div>
        <div className={`surface ${styles.installCard}`}>
          <span className={styles.eyebrow}>Homebrew</span>
          <h3>On your Mac, no Docker</h3>
          <p>Runs as a background service. Add your phone later with one command.</p>
          <div className={styles.stack}>
            <CodeBlock language="bash">{"brew install zeapsu/tap/delta\nbrew services start delta"}</CodeBlock>
          </div>
          <Link className={styles.installLink} to="/docs/homebrew">
            Homebrew guide <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Get Plaid keys", body: "Free Trial plan, real US and Canadian banks.", to: "/docs/plaid-trial" },
  { title: "Run Delta", body: "From an app panel or a terminal, on any always-on machine.", to: "/#install" },
  { title: "Link accounts", body: "In your browser. Syncs every 6 hours.", to: "/docs/self-hosting#4-link-your-accounts" },
  { title: "Connect your agent", body: "Create a token, paste the config, ask.", to: "/docs/agents" },
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
              Net worth, spending, cash flow, budgets, recurring charges and investments. Relabel once and every view follows.
            </p>
          </Feature>
          <Feature label="Agents" title="Ask the agent you already use" visual={<AgentVisual />} flip>
            <p>
              No built-in chatbot. Any MCP client gets the dashboard&apos;s numbers and how to read them. Read tokens look; write tokens can also edit.
            </p>
            <p>
              <strong>Ask</strong> on any card copies it as a prompt.
            </p>
          </Feature>
          <Feature label="Privacy" title="Stored on your hardware" visual={<HostVisual />}>
            <p>
              One SQLite file on your machine, on your private network. Plaid tokens never leave it. Daily backups. Agents read through a token you can revoke. With a local model, nothing you ask leaves your network.
            </p>
          </Feature>
        </section>

        <section className={`${styles.section} ${styles.cost}`}>
          <span className={styles.eyebrow}>What it costs</span>
          <p className={styles.price}>$0</p>
          <p className={styles.costText}>
            Open source (AGPL-3.0). Plaid&apos;s Trial plan is free for up to 10 banks.
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
            <Link className="btn btn-primary" to="/docs/home-server">
              Home server app
            </Link>
            <Link className="btn" to="/docs/self-hosting#terminal-install">
              Terminal install
            </Link>
            <Link className="btn" to="/docs/homebrew">
              Homebrew
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
