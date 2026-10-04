import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSuperAdminEmail } from "@/lib/access";
import type { Profile } from "@/lib/access";

export const profileQueryKey = ["profile"] as const;

const profileFields = "id,business_name,business_category,business_model,main_product,business_address,business_phone,user_email,license_until,stock_scheme,created_at";

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("profiles").select(profileFields).eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      if (isSuperAdminEmail(u.user.email)) return { userId: u.user.id, profile: data as Profile | null, email: u.user.email ?? null, role: "owner" as const, ownerId: u.user.id };
      const { data: membership, error: teamError } = await supabase.from("team_members").select("owner_id,position").eq("user_id", u.user.id).maybeSingle();
      if (teamError) throw teamError;
      let profile = data as Profile | null;
      if (membership) {
        const { data: business, error: ownerError } = await supabase.from("profiles").select(profileFields).eq("id", membership.owner_id).single();
        if (ownerError) throw ownerError;
        profile = business as Profile;
      }
      return { userId: u.user.id, profile, email: u.user.email ?? null, role: membership ? (membership.position === "manager" ? ("manager" as const) : ("sales" as const)) : ("owner" as const), ownerId: membership?.owner_id ?? u.user.id };
    },
  });
}
