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
// Lives in lib/plaid-errors.ts so scripts can use it without the Plaid client.
import { safePlaidError } from "@/lib/plaid-errors";
export { safePlaidError };

// Insert or refresh an item's accounts. Also run when a bank is linked (the
// exchange route), so a connection has its accounts even if its first sync
// fails: the duplicate check on the next link compares against them.
export function saveAccounts(
  tx: Pick<typeof db, "insert">,
  itemId: number,
  accountsPayload: AccountBase[],
) {
  for (const a of accountsPayload) {
    tx
      .insert(accounts)
      .values({
        itemId,
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
}

function applySync(
  item: Item,
  accountsPayload: AccountBase[],
  addedOrModified: PlaidTransaction[],
  removedIds: string[],
  nextCursor: string,
) {
  db.transaction((tx) => {
    saveAccounts(tx, item.id, accountsPayload);

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
      // Totals count pending rows, so a posted row must replace its pending
      // one. Plaid also lists the pending id in `removed`, but drop it here
      // too in case the two land in different syncs.
      // The posted row has a new id, so a relabel made while the charge was
      // pending moves over with it.
      let override: string | null = null;
      if (!t.pending && t.pending_transaction_id) {
        override =
          tx
            .delete(transactions)
            .where(eq(transactions.plaidTransactionId, t.pending_transaction_id))
            .returning({ override: transactions.categoryOverride })
            .get()?.override ?? null;
      }
      const plaidCategory = t.personal_finance_category?.primary ?? null;
      const category =
        override ?? rules.get(merchantKey(t.merchant_name ?? null, t.name)) ?? plaidCategory;
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
          categoryOverride: override,
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
            categoryOverride: sql`coalesce(${transactions.categoryOverride}, ${override})`,
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

async function syncItem(item: Item): Promise<SyncCounts> {
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

// The 6h timer, the Sync buttons and a new link can overlap; two runs at once
// would read the same cursor and double every balance snapshot. So runs go
// one at a time, in order. ponytail: module-level, single process.
let tail: Promise<unknown> = Promise.resolve();

function enqueue(start: () => Promise<SyncResult>): Promise<SyncResult> {
  const run = tail.then(start);
  tail = run.catch(() => {});
  return run;
}

// A caller that arrives while a full run is queued or running joins it.
let full: Promise<SyncResult> | null = null;

export function syncAll(): Promise<SyncResult> {
  full ??= enqueue(() => runSync(db.select().from(items).all())).finally(() => {
    full = null;
  });
  return full;
}

// One connection (the per-institution refresh, the post-Reconnect sync, the
// first sync after linking). It waits its turn rather than joining a run in
// progress: that run may have passed this item already, or started before the
// item existed or was reconnected. Only a run for the same item that hasn't
// started yet is shared.
const waiting = new Map<number, Promise<SyncResult>>();

export async function syncOne(itemId: number): Promise<SyncResult | null> {
  const queued = waiting.get(itemId);
  if (queued) return queued;
  const exists = db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).get();
  if (!exists) return null;
  const run = enqueue(() => {
    waiting.delete(itemId);
    // Read at start: a run ahead of this one may have moved the cursor.
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    return runSync(item ? [item] : []);
  });
  waiting.set(itemId, run);
  return run;
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

export type RefreshResult = {
  refreshed: number;
  skipped: { itemId: number; institution: string | null; error_code: string }[];
};

// Plaid only re-checks a bank for transactions 1-4x a day, while balances
// are live, so a new charge can move the balance hours before it shows up.
// /transactions/refresh asks Plaid to check now (free on the Trial plan,
// billed per call on paid plans). It's async with no webhook here, so the
// delta-sync timer calls this, waits, then syncs. Some items can't refresh
// (Capital One credit-only items answer PRODUCTS_NOT_SUPPORTED): skip them,
// never fail the run and never touch last_error_code — the sync owns that.
export async function refreshAll(): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: 0, skipped: [] };
  for (const item of db.select().from(items).all()) {
    try {
      await getPlaid().transactionsRefresh({ access_token: item.accessToken });
      result.refreshed++;
    } catch (err) {
      const e = safePlaidError(err);
      console.warn(
        `plaid refresh skipped: item=${item.id} institution=${JSON.stringify(item.institutionName)} error_code=${e.error_code} request_id=${e.request_id}`,
      );
      result.skipped.push({ itemId: item.id, institution: item.institutionName, error_code: e.error_code });
    }
  }
  return result;
}
