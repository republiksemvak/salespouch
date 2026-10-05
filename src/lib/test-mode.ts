export type TestMode = "owner" | "manager" | "sales";

export const TEST_MODE_KEY = "salespouch_test_mode";

export function getTestMode(): TestMode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(TEST_MODE_KEY);
  return value === "owner" || value === "manager" || value === "sales" ? value : null;
}

export function setTestMode(mode: TestMode | null) {
  if (typeof window === "undefined") return;
  if (mode) window.localStorage.setItem(TEST_MODE_KEY, mode);
  else window.localStorage.removeItem(TEST_MODE_KEY);
}
