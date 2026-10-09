export const ADMIN_TELEGRAM = "https://t.me/salespouch";
export const ADMIN_WHATSAPP = "https://wa.me/6285783797770";

export const SUPER_ADMIN_EMAILS = [
  "candraprinting@gmail.com",
  "ganlapor@gmail.com",
  "republiksemvak@gmail.com",
] as const;

export function isSuperAdminEmail(email?: string | null): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase() as (typeof SUPER_ADMIN_EMAILS)[number]);
}

export type StockScheme = "accumulation" | "clean_pull";

export type Profile = {
  id: string;
  business_name: string | null;
  business_category: string | null;
  business_model: string | null;
  main_product: string | null;
  business_address: string | null;
  business_phone: string | null;
  user_email: string | null;
  license_until: string | null;
  stock_scheme: StockScheme;
  created_at: string;
  display_name?: string | null;
  username?: string | null;
  account_type?: string | null;
};

export type AccessStatus = {
  allowed: true;
  reason: "admin" | "licensed" | "freemium";
};

export function hasPremiumAccess(profile?: Profile | null, email?: string | null): boolean {
  if (isSuperAdminEmail(email ?? profile?.user_email)) return true;
  return !!profile?.license_until && new Date(profile.license_until) > new Date();
}

export function accessStatus(profile: Profile, email?: string | null): AccessStatus {
  if (isSuperAdminEmail(email ?? profile.user_email)) {
    return { allowed: true, reason: "admin" };
  }
  if (profile.license_until && new Date(profile.license_until) > new Date()) {
    return { allowed: true, reason: "licensed" };
  }
  return { allowed: true, reason: "freemium" };
}
