// DB side of API tokens: lookup for proxy.ts, create/list/revoke for the CLI
// (scripts/api-token.ts). The plaintext token is returned once by
// createToken() and never stored.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { hashToken, newToken, tokenPrefix, type Scope } from "@/lib/api-auth";

export async function createToken(name: string, scope: Scope) {
  const token = newToken();
  const [row] = await db
    .insert(apiTokens)
    .values({ name, scope, tokenHash: hashToken(token), prefix: tokenPrefix(token) })
    .returning({ id: apiTokens.id });
  return { id: row.id, token };
}

export async function listTokens() {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scope: apiTokens.scope,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .orderBy(apiTokens.id);
}

export async function revokeToken(id: number): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

// The active token's scope, or null if unknown/revoked. Touches last_used_at
// at most once a minute so a busy agent doesn't write on every request.
export async function lookupToken(token: string): Promise<{ id: number; scope: string } | null> {
  const [row] = await db
    .select({ id: apiTokens.id, scope: apiTokens.scope, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date(now) }).where(eq(apiTokens.id, row.id));
  }
  return { id: row.id, scope: row.scope };
}
