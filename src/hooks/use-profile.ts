import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSuperAdminEmail } from "@/lib/access";
import type { Profile } from "@/lib/access";
import { getTestMode } from "@/lib/test-mode";

export const profileQueryKey = ["profile"] as const;

const profileFields = "id,business_name,business_category,business_model,main_product,business_address,business_phone,user_email,license_until,stock_scheme,created_at,account_type,username,display_name";

export function useProfile() {
  return useQuery({
    queryKey: [...profileQueryKey, typeof window === "undefined" ? null : getTestMode()],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const email = u.user.email ?? null;
      const testMode = isSuperAdminEmail(email) ? getTestMode() : null;

      // Load the user's profile and team membership in parallel.
      // This removes one sequential network round-trip for employee accounts.
      const [{ data, error }, { data: membership, error: teamError }] = await Promise.all([
        supabase.from("profiles").select(profileFields).eq("id", u.user.id).maybeSingle(),
        supabase.from("team_members").select("owner_id,position").eq("user_id", u.user.id).maybeSingle(),
      ]);
      if (error) throw error;
      if (teamError) throw teamError;

      if (isSuperAdminEmail(email)) {
        return {
          userId: u.user.id,
          profile: data as Profile | null,
          email,
          role: testMode ?? "owner",
          ownerId: u.user.id,
          testMode,
        } as const;
      }

      let profile = data as Profile | null;
      if (membership) {
        const { data: business, error: ownerError } = await supabase.from("profiles").select(profileFields).eq("id", membership.owner_id).single();
        if (ownerError) throw ownerError;

        // Preserve the employee's personal name while using the owner's business details.
        const personalDisplayName =
          (data as Profile | null)?.display_name ||
          u.user.user_metadata?.display_name ||
          (data as Profile | null)?.username ||
          u.user.user_metadata?.username ||
          null;

        const personalUsername =
          (data as Profile | null)?.username ||
          u.user.user_metadata?.username ||
          null;

        profile = {
          ...(business as Profile),
          display_name: personalDisplayName,
          username: personalUsername,
        };
      }

      const accountType = (data as Profile | null)?.account_type;
      if (!membership && accountType === "employee") {
        throw new Error("Akun karyawan tidak terhubung ke usaha. Hubungi Owner untuk mendapatkan akses kembali.");
      }

      const role = membership
        ? membership.position === "manager"
          ? ("manager" as const)
          : membership.position === "admin"
            ? ("admin" as const)
            : ("sales" as const)
        : ("owner" as const);

      return {
        userId: u.user.id,
        profile,
        email,
        role,
        ownerId: membership?.owner_id ?? u.user.id,
        testMode: null,
      } as const;
    },
  });
}
