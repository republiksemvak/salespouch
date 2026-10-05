import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSuperAdminEmail } from "@/lib/access";
import { getTestMode } from "@/lib/test-mode";

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin", typeof window === "undefined" ? null : getTestMode()],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!isSuperAdminEmail(u.user?.email)) return false;
      return getTestMode() === null;
    },
  });
}
