import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSuperAdminEmail } from "@/lib/access";
import type { Profile } from "@/lib/access";
import { getTestMode } from "@/lib/test-mode";

export const profileQueryKey = ["profile"] as const;

const profileFields = "id,business_name,business_category,business_model,main_product,business_address,business_phone,user_email,license_until,stock_scheme,created_at";

export function useProfile() {
  return useQuery({
    queryKey: [...profileQueryKey, typeof window === "undefined" ? null : getTestMode()],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const email = u.user.email ?? null;
      const testMode = isSuperAdminEmail(email) ? getTestMode() : null;

      const { data, error } = await supabase.from("profiles").select(profileFields).eq("id", u.user.id).maybeSingle();
      if (error) throw error;

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

      const { data: membership, error: teamError } = await supabase
        .from("team_members")
        .select("owner_id,position")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (teamError) throw teamError;

      let profile = data as Profile | null;
      if (membership) {
        const { data: business, error: ownerError } = await supabase.from("profiles").select(profileFields).eq("id", membership.owner_id).single();
        if (ownerError) throw ownerError;
        profile = business as Profile;
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
