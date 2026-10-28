import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, items } from "@/db/schema";
import { readRoute } from "@/lib/api-params";

export const dynamic = "force-dynamic";

export const GET = readRoute(async () => ({
  accounts: await db
    .select({
      id: accounts.id,
      name: accounts.name,
      officialName: accounts.officialName,
      type: accounts.type,
      subtype: accounts.subtype,
      mask: accounts.mask,
      currentBalance: accounts.currentBalance,
      availableBalance: accounts.availableBalance,
      currency: accounts.currency,
      connectionId: items.id,
      institution: items.institutionName,
    })
    .from(accounts)
    .innerJoin(items, eq(accounts.itemId, items.id))
    .orderBy(accounts.id),
}));
