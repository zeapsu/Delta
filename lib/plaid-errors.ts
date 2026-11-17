import { PlaidError, PlaidTimeoutError } from "plaid";

// Kept apart from lib/sync.ts so pages can import it without the Plaid client.

// Plaid error codes that only the user can fix by logging in again through
// Link update mode (vs. transient ones like INSTITUTION_DOWN that clear on
// their own next sync).
export const REAUTH_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "ACCESS_NOT_GRANTED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "INSUFFICIENT_CREDENTIALS",
  "NO_ACCOUNTS",
]);

// The item no longer exists at Plaid for these keys (removed there, or by the
// user at the bank): update mode can't repair it, only a new link can.
export const GONE_ERROR_CODES = new Set(["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"]);

function shortString(v: unknown): string | null {
  return typeof v === "string" ? v.slice(0, 100) : null;
}

// Plaid's error_code (ITEM_LOGIN_REQUIRED, ...) when Plaid answered with one.
export function plaidErrorCode(err: unknown): string | undefined {
  if (!(err instanceof PlaidError)) return undefined;
  const body = err.body as { error_code?: unknown } | null | undefined;
  return typeof body?.error_code === "string" ? body.error_code : undefined;
}

// Log or return these fields, not the error. The SDK's errors no longer carry
// the request (keys, access_token), but the body and message are whatever the
// server sent, and a non-Plaid error can echo query params.
export function safePlaidError(err: unknown) {
  if (err instanceof PlaidError) {
    const body = (err.body ?? null) as Record<string, unknown> | null;
    const cause = err.cause as { code?: unknown } | undefined;
    return {
      error_code:
        shortString(body?.error_code) ??
        (err instanceof PlaidTimeoutError ? "TIMEOUT" : null) ??
        (err.statusCode ? `HTTP_${err.statusCode}` : null) ??
        shortString(cause?.code) ??
        "NETWORK_ERROR",
      error_code_reason: shortString(body?.error_code_reason),
      request_id: shortString(body?.request_id) ?? shortString(err.requestId),
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
