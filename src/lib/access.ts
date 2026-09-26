export const BYPASS_EMAILS = ["ganlapor@gmail.com", "candraprinting@gmail.com"];
export const TRIAL_MS = 24 * 60 * 60 * 1000;
export const ADMIN_TELEGRAM = "https://t.me/yayazimu";

export type Profile = {
  id: string;
  business_name: string | null;
  user_email: string | null;
  license_until: string | null;
  created_at: string;
};

export function accessStatus(profile: Profile, email?: string | null) {
  const mail = (email ?? profile.user_email ?? "").toLowerCase();
  if (BYPASS_EMAILS.includes(mail)) return { allowed: true, reason: "bypass" as const, trialEndsAt: null };
  if (profile.license_until && new Date(profile.license_until).getTime() > Date.now())
    return { allowed: true, reason: "license" as const, trialEndsAt: null };
  const trialEndsAt = new Date(new Date(profile.created_at).getTime() + TRIAL_MS);
  if (trialEndsAt.getTime() > Date.now()) return { allowed: true, reason: "trial" as const, trialEndsAt };
  return { allowed: false, reason: "expired" as const, trialEndsAt };
}
