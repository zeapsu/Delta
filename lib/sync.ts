import "server-only";
import { eq, inArray } from "drizzle-orm";
import { isAxiosError } from "axios";
import { db } from "@/db";
import { accounts, balanceSnapshots, items, transactions } from "@/db/schema";
import { plaid, toCents } from "@/lib/plaid";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";

type Item = typeof items.$inferSelect;

type SyncCounts = { added: number; modified: number; removed: number };

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

    for (const t of addedOrModified) {
      const accountId = accountIdByPlaidId.get(t.account_id);
      if (accountId == null) continue;
      tx
        .insert(transactions)
        .values({
          accountId,
          plaidTransactionId: t.transaction_id,
          amount: toCents(t.amount),
          date: t.date,
          name: t.name,
          merchantName: t.merchant_name ?? null,
          category: t.personal_finance_category?.primary ?? null,
          pending: t.pending,
        })
        .onConflictDoUpdate({
          target: transactions.plaidTransactionId,
          set: {
            accountId,
            amount: toCents(t.amount),
            date: t.date,
            name: t.name,
            merchantName: t.merchant_name ?? null,
            category: t.personal_finance_category?.primary ?? null,
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

    for (const a of accountsPayload) {
      const accountId = accountIdByPlaidId.get(a.account_id);
      if (accountId == null) continue;
      tx
        .insert(balanceSnapshots)
        .values({
          accountId,
          currentBalance: toCents(a.balances.current ?? 0),
          snapshotAt: new Date(),
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
    const res = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor,
    });
    const data = res.data;
    accountsPayload = data.accounts;
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed.map((r) => r.transaction_id));
    nextCursor = data.next_cursor;
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  return { accountsPayload, added, modified, removed, nextCursor };
}

export async function syncItem(item: Item): Promise<SyncCounts> {
  try {
    const { accountsPayload, added, modified, removed, nextCursor } =
      await fetchAll(item);
    applySync(item, accountsPayload, [...added, ...modified], removed, nextCursor);
    return { added: added.length, modified: modified.length, removed: removed.length };
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
    return { added: added.length, modified: modified.length, removed: removed.length };
  }
}

export async function syncAll(): Promise<SyncCounts> {
  const allItems = db.select().from(items).all();
  const totals: SyncCounts = { added: 0, modified: 0, removed: 0 };
  for (const item of allItems) {
    const counts = await syncItem(item);
    totals.added += counts.added;
    totals.modified += counts.modified;
    totals.removed += counts.removed;
  }
  return totals;
}
