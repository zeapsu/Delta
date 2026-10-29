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
  // Plaid error_code from the latest sync attempt; null = last sync succeeded
  // (or never ran). ITEM_LOGIN_REQUIRED etc. drive the UI's Reconnect state.
  lastErrorCode: text("last_error_code"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
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
    // Effective category: categoryOverride ?? merchant rule ?? plaidCategory.
    // Kept materialized so every reader (dashboard, API, agent SQL) just uses it.
    category: text("category"),
    // Plaid's own primary category, kept so a relabel can be undone.
    plaidCategory: text("plaid_category"),
    // User relabel of this one transaction; survives syncs. Writes go through
    // /api/transactions/category only.
    categoryOverride: text("category_override"),
    // Plaid detailed category, e.g. LOAN_PAYMENTS_CREDIT_CARD_PAYMENT — needed
    // to tell card payments (not spend) from real loan payments (spend).
    categoryDetailed: text("category_detailed"),
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('now', 'subsec') * 1000)`),
  },
  (table) => [
    index("transactions_account_id_date_idx").on(table.accountId, table.date),
    // Dashboard queries filter/sort by date across all accounts.
    index("transactions_date_idx").on(table.date),
  ],
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

// "Every <merchant> is <category>" relabels, applied at sync time to rows
// without a per-transaction override. merchantKey = merchantKey() in
// lib/categories.ts. Writes go through /api/transactions/category only.
export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchantKey: text("merchant_key").notNull().unique(),
  category: text("category").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});

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

// Per-client API tokens for /api/v1 (agents, the MCP server). Only the
// sha256 of the token is stored; the plaintext is shown once at creation.
// scope "read" = GET only; "write" = GET plus the validated write routes.
// Revoked tokens keep their row (revokedAt set) so the CLI can list them.
export const apiTokens = sqliteTable("api_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  // First characters of the token, for telling tokens apart in listings.
  prefix: text("prefix").notNull(),
  scope: text("scope").notNull(), // "read" | "write"
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now', 'subsec') * 1000)`),
});
