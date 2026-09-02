// Use '*' to enable for all authenticated users (testing/dev).
// Replace with specific E.164 numbers (e.g. '+919876543210') to gate by phone number.
export const ALLOWLIST = ['*'];

// Returns true if mobile matches the allowlist (supports wildcard '*' for all users).
export const isAllowlisted = (mobile) =>
  ALLOWLIST.includes('*') || (!!mobile && ALLOWLIST.includes(mobile));
