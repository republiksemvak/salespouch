import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTeamPermissions } from "@/lib/team.functions";

export function useTeamPermissions(enabled = true) {
  const fetch = useServerFn(getMyTeamPermissions);
  return useQuery({
    queryKey: ["my-team-permissions"],
    enabled,
    queryFn: () => fetch({ data: {} }),
    staleTime: 30_000,
  });
}
