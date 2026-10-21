import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Plaid Items (one per linked institution connection).
// accessToken is the Plaid access token: never exposed to the agent layer,
// only used by API routes that talk to Plaid directly.
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plaidItemId: text("plaid_item_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  institutionName: text("institution_name"),
  // /transactions/sync cursor; null = never synced.
  syncCursor: text("sync_cursor"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  plaidAccountId: text("plaid_account_id").notNull().unique(),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  mask: text("mask"),
  // Money stored as integer cents.
  currentBalance: integer("current_balance"),
  availableBalance: integer("available_balance"),
  currency: text("currency").notNull().default("USD"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
    // Money stored as integer cents. Plaid convention: positive = money out.
    amount: integer("amount").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    category: text("category"),
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  },
  (table) => [index("transactions_account_id_date_idx").on(table.accountId, table.date)],
);

// Investment activity from /investments/transactions/get (buys/sells/dividends/
// fees). Separate from `transactions` — different shape, and buys must never
// count as spend. Security name/ticker are denormalized from the response's
// securities[] (no securities table — display only).
export const investmentTransactions = sqliteTable(
  "investment_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    plaidInvestmentTransactionId: text("plaid_investment_transaction_id")
      .notNull()
      .unique(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    name: text("name").notNull(),
    type: text("type").notNull(), // Plaid enum: buy/sell/cash/fee/transfer
    subtype: text("subtype").notNull(),
    securityName: text("security_name"),
    tickerSymbol: text("ticker_symbol"),
    // Fractional shares / sub-cent share prices — real, NOT cents.
    quantity: real("quantity"),
    price: real("price"),
    // Money stored as integer cents. Plaid convention: positive = money out.
    amount: integer("amount").notNull(),
    fees: integer("fees"),
    currency: text("currency").notNull().default("USD"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  },
  (table) => [
    index("investment_transactions_account_id_date_idx").on(
      table.accountId,
      table.date,
    ),
  ],
);

export const balanceSnapshots = sqliteTable("balance_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  // Money stored as integer cents.
  currentBalance: integer("current_balance").notNull(),
  snapshotAt: integer("snapshot_at", { mode: "timestamp_ms" }).notNull(),
});

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull().unique(),
  // Money stored as integer cents.
  monthlyAmount: integer("monthly_amount").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

// User-reviewed recurring series: the detector only suggests; these rows are
// the truth. status "confirmed" = counts as recurring; "dismissed" = suppress
// the matching suggestion. matchKey is the detector group key (null for
// manual adds). Writes go through /api/recurring only.
export const recurringRules = sqliteTable("recurring_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull(), // "confirmed" | "dismissed"
  matchKey: text("match_key"),
  name: text("name").notNull(),
  // Money stored as integer cents.
  amount: integer("amount").notNull(),
  gapDays: integer("gap_days").notNull(),
  anchorDate: text("anchor_date").notNull(), // ISO yyyy-mm-dd, last known/expected charge
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

// Chat conversations; transcripts live in `messages`.
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant"
    text: text("text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)],
);
