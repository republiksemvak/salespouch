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
      return { profile: data as Profile | null, email: u.user.email ?? null };
    },
  });
}
