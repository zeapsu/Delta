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
