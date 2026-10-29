import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { isAxiosError } from "axios";
import { db } from "@/db";
import {
  accounts,
  balanceSnapshots,
  categoryRules,
  investmentTransactions,
  items,
  transactions,
} from "@/db/schema";
import { merchantKey } from "@/lib/categories";
import { getPlaid, toCents } from "@/lib/plaid";
import type {
  AccountBase,
  InvestmentTransaction,
  Security,
  Transaction as PlaidTransaction,
} from "plaid";

type Item = typeof items.$inferSelect;

type SyncCounts = {
  added: number;
  modified: number;
  removed: number;
  investments: number;
};

type SyncError = {
  itemId: number;
  institution: string | null;
  error_code: string;
};

export type SyncResult = SyncCounts & { errors: SyncError[] };

// A non-Plaid body (e.g. a gateway 502) can put anything in these fields.
function shortString(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, 100) : null;
}

// Never log or return a raw Axios/Plaid error: err.config.data is the request
// body, which carries client_id, secret and the item's access_token. Pick
// these fields instead.
export function safePlaidError(err: unknown) {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    return {
      error_code: shortString(data?.error_code) ?? err.code ?? "AXIOS_ERROR",
      error_code_reason: shortString(data?.error_code_reason),
      request_id: shortString(data?.request_id),
    };
  }
  // Non-Plaid errors (e.g. Drizzle) can echo query params in the message —
  // keep only the class name.
  return {
    error_code: err instanceof Error ? err.name : "UNKNOWN_ERROR",
    error_code_reason: null,
    request_id: null,
  };
}

function applySync(
  item: Item,
  accountsPayload: AccountBase[],
  addedOrModified: PlaidTransaction[],
  removedIds: string[],
  nextCursor: string,
) {
  db.transaction((tx) => {
    for (const a of accountsPayload) {
      tx
        .insert(accounts)
        .values({
          itemId: item.id,
          plaidAccountId: a.account_id,
          name: a.name,
          officialName: a.official_name ?? null,
          type: a.type,
          subtype: a.subtype ?? null,
          mask: a.mask ?? null,
          currentBalance:
            a.balances.current != null ? toCents(a.balances.current) : null,
          availableBalance:
            a.balances.available != null ? toCents(a.balances.available) : null,
          currency: a.balances.iso_currency_code ?? "USD",
        })
        .onConflictDoUpdate({
          target: accounts.plaidAccountId,
          set: {
            name: a.name,
            officialName: a.official_name ?? null,
            type: a.type,
            subtype: a.subtype ?? null,
            mask: a.mask ?? null,
            currentBalance:
              a.balances.current != null ? toCents(a.balances.current) : null,
            availableBalance:
              a.balances.available != null
                ? toCents(a.balances.available)
                : null,
            currency: a.balances.iso_currency_code ?? "USD",
          },
        })
        .run();
    }

    const accountRows = tx
      .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
      .from(accounts)
      .where(eq(accounts.itemId, item.id))
      .all();
    const accountIdByPlaidId = new Map(
      accountRows.map((r) => [r.plaidAccountId, r.id]),
    );

    // User relabels win over Plaid: a per-transaction override (kept by the
    // coalesce below), else a merchant rule, else Plaid's category.
    const rules = new Map(
      tx.select({ key: categoryRules.merchantKey, category: categoryRules.category })
        .from(categoryRules)
        .all()
        .map((r) => [r.key, r.category]),
    );

    for (const t of addedOrModified) {
      const accountId = accountIdByPlaidId.get(t.account_id);
      if (accountId == null) continue;
      const plaidCategory = t.personal_finance_category?.primary ?? null;
      const category = rules.get(merchantKey(t.merchant_name ?? null, t.name)) ?? plaidCategory;
      tx
        .insert(transactions)
        .values({
          accountId,
          plaidTransactionId: t.transaction_id,
          amount: toCents(t.amount),
          date: t.date,
          authorizedDate: t.authorized_date ?? null,
          name: t.name,
          merchantName: t.merchant_name ?? null,
          category,
          plaidCategory,
          categoryDetailed: t.personal_finance_category?.detailed ?? null,
          pending: t.pending,
        })
        .onConflictDoUpdate({
          target: transactions.plaidTransactionId,
          set: {
            accountId,
            amount: toCents(t.amount),
            date: t.date,
            authorizedDate: t.authorized_date ?? null,
            name: t.name,
            merchantName: t.merchant_name ?? null,
            category: sql`coalesce(${transactions.categoryOverride}, ${category})`,
            plaidCategory,
            categoryDetailed: t.personal_finance_category?.detailed ?? null,
            pending: t.pending,
          },
        })
        .run();
    }

    if (removedIds.length > 0) {
      tx
        .delete(transactions)
        .where(inArray(transactions.plaidTransactionId, removedIds))
        .run();
    }

    // One timestamp per sync run so snapshots group cleanly (net worth over time).
    const snapshotAt = new Date();
    // A null balance means "unknown", not zero — recording 0 would put a
    // fake dip in the net-worth history.
    for (const a of accountsPayload) {
      const accountId = accountIdByPlaidId.get(a.account_id);
      if (accountId == null || a.balances.current == null) continue;
      tx
        .insert(balanceSnapshots)
        .values({
          accountId,
          currentBalance: toCents(a.balances.current),
          snapshotAt,
        })
        .run();
    }

    tx.update(items).set({ syncCursor: nextCursor }).where(eq(items.id, item.id)).run();
  });
}

async function fetchAll(item: Item) {
  let cursor = item.syncCursor ?? undefined;
  let accountsPayload: AccountBase[] = [];
  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: string[] = [];
  let hasMore = true;
  let nextCursor = cursor ?? "";

  while (hasMore) {
    const res = await getPlaid().transactionsSync({
      access_token: item.accessToken,
      cursor,
    });
    const data = res.data;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed.map((r) => r.transaction_id));
    nextCursor = data.next_cursor;
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  // transactionsSync returns accounts: [] when nothing changed, so fetch
  // balances explicitly — issue #4 wants a snapshot per account per sync.
  const balRes = await getPlaid().accountsBalanceGet({
    access_token: item.accessToken,
  });
  accountsPayload = balRes.data.accounts;

  return { accountsPayload, added, modified, removed, nextCursor };
}

// The investments product may not be live on an item even when it has an
// investment-type account (consent/product gaps) — skip, don't fail the run.
const TOLERATED_INVESTMENT_ERRORS = new Set([
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_READY",
  "NO_INVESTMENT_ACCOUNTS",
  "ADDITIONAL_CONSENT_REQUIRED",
]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// No cursor for /investments/transactions/get: re-fetch a window anchored at
// the newest stored row minus 14 days (overlap absorbs late-posting
// corrections; upsert by Plaid id keeps it idempotent), 24 months back when
// empty. ponytail: cancel_transaction_id reversals arrive as new rows and are
// not reconciled — revisit if a brokerage ever shows phantom activity.
async function syncInvestments(item: Item): Promise<number> {
  const accountRows = db
    .select({
      id: accounts.id,
      plaidAccountId: accounts.plaidAccountId,
      type: accounts.type,
    })
    .from(accounts)
    .where(eq(accounts.itemId, item.id))
    .all();
  if (!accountRows.some((a) => a.type === "investment")) return 0;
  const accountIdByPlaidId = new Map(
    accountRows.map((r) => [r.plaidAccountId, r.id]),
  );

  const latest = db
    .select({ maxDate: sql<string | null>`MAX(${investmentTransactions.date})` })
    .from(investmentTransactions)
    .where(
      inArray(
        investmentTransactions.accountId,
        accountRows.map((r) => r.id),
      ),
    )
    .get();
  const start = latest?.maxDate ? new Date(latest.maxDate) : new Date();
  start.setDate(start.getDate() - (latest?.maxDate ? 14 : 730));
  const startDate = isoDate(start);
  const endDate = isoDate(new Date());

  const collected: InvestmentTransaction[] = [];
  const securities = new Map<string, Security>();
  let total = Infinity;
  try {
    while (collected.length < total) {
      const res = await getPlaid().investmentsTransactionsGet({
        access_token: item.accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset: collected.length },
      });
      total = res.data.total_investment_transactions;
      for (const s of res.data.securities) securities.set(s.security_id, s);
      if (res.data.investment_transactions.length === 0) break;
      collected.push(...res.data.investment_transactions);
    }
  } catch (err) {
    const errorCode = isAxiosError(err)
      ? err.response?.data?.error_code
      : undefined;
    if (errorCode && TOLERATED_INVESTMENT_ERRORS.has(errorCode)) {
      console.warn(
        `investments sync skipped for item ${item.id}: ${errorCode}`,
      );
      return 0;
    }
    throw err;
  }

  db.transaction((tx) => {
    for (const t of collected) {
      const accountId = accountIdByPlaidId.get(t.account_id);
      if (accountId == null) continue;
      const security = t.security_id ? securities.get(t.security_id) : undefined;
      const values = {
        accountId,
        date: t.date,
        name: t.name,
        type: t.type,
        subtype: t.subtype,
        securityName: security?.name ?? null,
        tickerSymbol: security?.ticker_symbol ?? null,
        quantity: t.quantity,
        price: t.price,
        amount: toCents(t.amount),
        fees: t.fees != null ? toCents(t.fees) : null,
        currency: t.iso_currency_code ?? "USD",
      };
      tx
        .insert(investmentTransactions)
        .values({
          ...values,
          plaidInvestmentTransactionId: t.investment_transaction_id,
        })
        .onConflictDoUpdate({
          target: investmentTransactions.plaidInvestmentTransactionId,
          set: values,
        })
        .run();
    }
  });
  return collected.length;
}

export async function syncItem(item: Item): Promise<SyncCounts> {
  let base: Omit<SyncCounts, "investments">;
  try {
    const { accountsPayload, added, modified, removed, nextCursor } =
      await fetchAll(item);
    applySync(item, accountsPayload, [...added, ...modified], removed, nextCursor);
    base = { added: added.length, modified: modified.length, removed: removed.length };
  } catch (err) {
    const errorCode = isAxiosError(err)
      ? err.response?.data?.error_code
      : undefined;
    if (errorCode !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") throw err;

    // ponytail: single retry from freshest saved cursor, per Plaid's documented recovery
    const freshItem = db
      .select()
      .from(items)
      .where(eq(items.id, item.id))
      .get();
    if (!freshItem) throw err;
    const { accountsPayload, added, modified, removed, nextCursor } =
      await fetchAll(freshItem);
    applySync(freshItem, accountsPayload, [...added, ...modified], removed, nextCursor);
    base = { added: added.length, modified: modified.length, removed: removed.length };
  }
  const investments = await syncInvestments(item);
  return { ...base, investments };
}

// The 6h timer and the Sync button can overlap; two runs would read the same
// cursor and double every balance snapshot. A caller that arrives mid-run
// joins the in-flight run instead. ponytail: module-level, single process.
let inFlight: Promise<SyncResult> | null = null;

export function syncAll(): Promise<SyncResult> {
  inFlight ??= runSync(db.select().from(items).all()).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// One connection (the per-institution refresh / post-Reconnect sync). Joins a
// running sync rather than overlapping it — a full run covers this item too.
export async function syncOne(itemId: number): Promise<SyncResult | null> {
  if (inFlight) return inFlight;
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) return null;
  inFlight = runSync([item]).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// One failing item (e.g. ITEM_LOGIN_REQUIRED) must not block the rest.
async function runSync(allItems: Item[]): Promise<SyncResult> {
  const totals: SyncResult = {
    added: 0,
    modified: 0,
    removed: 0,
    investments: 0,
    errors: [],
  };
  for (const item of allItems) {
    let counts: SyncCounts;
    try {
      counts = await syncItem(item);
    } catch (err) {
      const e = safePlaidError(err);
      console.error(
        `plaid sync failed: item=${item.id} institution=${JSON.stringify(item.institutionName)} error_code=${e.error_code} error_code_reason=${e.error_code_reason} request_id=${e.request_id}`,
      );
      totals.errors.push({
        itemId: item.id,
        institution: item.institutionName,
        error_code: e.error_code,
      });
      db.update(items).set({ lastErrorCode: e.error_code }).where(eq(items.id, item.id)).run();
      continue;
    }
    db.update(items)
      .set({ lastErrorCode: null, lastSyncedAt: new Date() })
      .where(eq(items.id, item.id))
      .run();
    totals.added += counts.added;
    totals.modified += counts.modified;
    totals.removed += counts.removed;
    totals.investments += counts.investments;
  }
  return totals;
}
