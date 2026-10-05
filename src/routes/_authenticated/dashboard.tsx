import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { isSuperAdminEmail } from "@/lib/access";
import { getTestMode } from "@/lib/test-mode";
import { SuperAdminDashboard, OwnerDashboard, ManagerDashboard, SalesDashboard } from "@/components/role-dashboards";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Sales Pouch" }, { name: "description", content: "Dashboard Sales Pouch." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: p, isLoading } = useProfile();
  if (isLoading || !p) return <div className="min-h-screen p-10 text-center text-muted-foreground">Memuat dashboard…</div>;

  const superAdmin = isSuperAdminEmail(p.email);
  const testMode = superAdmin ? getTestMode() : null;
  const effectiveRole = superAdmin ? testMode ?? "super-admin" : p.role;

  if (effectiveRole === "super-admin") return <SuperAdminDashboard />;
  if (effectiveRole === "manager") return <ManagerDashboard profile={p.profile} businessName={p.profile?.business_name} />;
  if (effectiveRole === "sales") return <SalesDashboard profile={p.profile} businessName={p.profile?.business_name} />;

  return (
    <>
      <OwnerDashboard profile={p.profile} businessName={p.profile?.business_name} />
      <div className="fixed bottom-3 right-3">
        <Button variant="outline" size="icon" className="rounded-full bg-card shadow-md" onClick={() => supabase.auth.signOut()} aria-label="Keluar">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
