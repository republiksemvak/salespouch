import { Construction, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";

interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  message: string;
  eta: string | null;
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const maintenanceQuery = useQuery({
    queryKey: ["system-maintenance"],
    queryFn: async (): Promise<MaintenanceSettings> => {
      const { data, error } = await supabase
        .from("system_maintenance")
        .select("enabled, title, message, eta")
        .eq("id", 1)
        .maybeSingle();

      if (error) throw error;

      return (
        data ?? {
          enabled: false,
          title: "Sedang Dalam Pemeliharaan",
          message:
            "Kami sedang melakukan perbaikan dan pengembangan sistem. Silakan kembali beberapa saat lagi.",
          eta: null,
        }
      );
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const isAuthRoute = location.pathname === "/auth";
  const isMaintenanceAdminRoute = location.pathname === "/admin-maintenance";
  const isAdminRoute = location.pathname.startsWith("/admin");

  // Auth must remain reachable so users can sign in, and Super Admin must
  // remain able to reach the maintenance controls while maintenance is on.
  const bypassMaintenance =
    isAuthRoute || isMaintenanceAdminRoute || isAdminRoute || isAdmin;

  if (
    !bypassMaintenance &&
    !adminLoading &&
    !maintenanceQuery.isLoading &&
    maintenanceQuery.data?.enabled
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="h-8 w-8" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
            {maintenanceQuery.data.title}
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {maintenanceQuery.data.message}
          </p>

          {maintenanceQuery.data.eta && (
            <div className="mt-5 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium text-foreground">Perkiraan selesai:</span>{" "}
              <span className="text-muted-foreground">{maintenanceQuery.data.eta}</span>
            </div>
          )}

          <Button
            variant="outline"
            className="mt-6"
            onClick={() => maintenanceQuery.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Cek kembali
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
