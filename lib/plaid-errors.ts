import { isAxiosError } from "axios";

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
