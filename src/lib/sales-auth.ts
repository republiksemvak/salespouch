export const SALES_AUTH_DOMAIN = "salespouch.local";

export function normalizeSalesUsername(value: string) {
  return value.trim().toLowerCase();
}

export function salesAuthEmail(username: string) {
  return `${normalizeSalesUsername(username)}@${SALES_AUTH_DOMAIN}`;
}
