import assert from "node:assert";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  "/private/tmp/claude-501/-Users-andrypaez-projects-Delta/babb27a5-47ba-45d9-b106-fafa00e9b682/scratchpad",
  "delta-check.db",
);

async function main() {
  const { db } = await import("./index");
  const { items, accounts, transactions, balanceSnapshots, budgets } = await import(
    "./schema"
  );

  const [item] = await db
    .insert(items)
    .values({
      plaidItemId: "plaid-item-1",
      accessToken: "access-token-1",
      institutionName: "Test Bank",
    })
    .returning();
  assert(item.id > 0, "item should have an id");

  const [account] = await db
    .insert(accounts)
    .values({
      itemId: item.id,
      plaidAccountId: "plaid-account-1",
      name: "Checking",
      type: "depository",
      subtype: "checking",
      currentBalance: 100_00,
      availableBalance: 95_00,
    })
    .returning();
  assert(account.id > 0, "account should have an id");

  const [transaction] = await db
    .insert(transactions)
    .values({
      accountId: account.id,
      plaidTransactionId: "plaid-txn-1",
      amount: 25_00,
      date: "2026-07-08",
      name: "Coffee Shop",
    })
    .returning();
  assert(transaction.id > 0, "transaction should have an id");

  const [snapshot] = await db
    .insert(balanceSnapshots)
    .values({
      accountId: account.id,
      currentBalance: 100_00,
      snapshotAt: new Date(),
    })
    .returning();
  assert(snapshot.id > 0, "snapshot should have an id");

  const [budget] = await db
    .insert(budgets)
    .values({
      category: "groceries",
      monthlyAmount: 400_00,
    })
    .returning();
  assert(budget.id > 0, "budget should have an id");

  const readItems = await db.select().from(items);
  const readAccounts = await db.select().from(accounts);
  const readTransactions = await db.select().from(transactions);
  const readSnapshots = await db.select().from(balanceSnapshots);
  const readBudgets = await db.select().from(budgets);

  assert.strictEqual(readItems.length, 1, "expected 1 item");
  assert.strictEqual(readAccounts.length, 1, "expected 1 account");
  assert.strictEqual(readTransactions.length, 1, "expected 1 transaction");
  assert.strictEqual(readSnapshots.length, 1, "expected 1 snapshot");
  assert.strictEqual(readBudgets.length, 1, "expected 1 budget");

  assert.strictEqual(readAccounts[0].itemId, item.id, "account.itemId should match item.id");
  assert.strictEqual(
    readTransactions[0].accountId,
    account.id,
    "transaction.accountId should match account.id",
  );
  assert.strictEqual(readTransactions[0].pending, false, "pending should default to false");

  console.log("db/check.ts: all assertions passed");
}

main();
