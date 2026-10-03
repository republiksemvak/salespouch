export const TRIAL_MS = 24 * 60 * 60 * 1000;
export const ADMIN_TELEGRAM = "https://t.me/salespouch";
export const ADMIN_WHATSAPP = "https://wa.me/6285783797770";

export type StockScheme = "accumulation" | "clean_pull";

export type Profile = {
  id: string;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  user_email: string | null;
  license_until: string | null;
  stock_scheme: StockScheme;
  created_at: string;
};

export type AccessStatus =
  | { allowed: true; reason: "admin" | "licensed" | "trial"; trialEndsAt?: Date }
  | { allowed: false; reason: "expired" };

export function accessStatus(profile: Profile, email?: string | null): AccessStatus {
  if (email && (email === "candraprinting@gmail.com" || email === "ganlapor@gmail.com")) {
    return { allowed: true, reason: "admin" };
  }
  if (profile.license_until && new Date(profile.license_until) > new Date()) {
    return { allowed: true, reason: "licensed" };
  }
  const trialEnd = new Date(new Date(profile.created_at).getTime() + TRIAL_MS);
  if (trialEnd > new Date()) {
    return { allowed: true, reason: "trial", trialEndsAt: trialEnd };
  }
  return { allowed: false, reason: "expired" };
}
