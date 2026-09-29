import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/access";

export const profileQueryKey = ["profile"] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      const { data: membership, error: teamError } = await supabase.from("team_members").select("owner_id").eq("user_id", u.user.id).maybeSingle();
      if (teamError) throw teamError;
      let profile = data as Profile | null;
      if (membership) {
        const { data: business, error: ownerError } = await supabase.from("profiles").select("*").eq("id", membership.owner_id).single();
        if (ownerError) throw ownerError;
        profile = business as Profile;
      }
      return { profile, email: membership ? profile?.user_email ?? null : u.user.email ?? null, role: membership ? "sales" as const : "owner" as const, ownerId: membership?.owner_id ?? u.user.id };
    },
  });
}
