import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/use-profile";
import { isSuperAdminEmail } from "@/lib/access";
import { getTestMode } from "@/lib/test-mode";
import { getMyTeamPermissions } from "@/lib/team.functions";
import { SuperAdminDashboard, OwnerDashboard, ManagerDashboard, AdminDashboard, SalesDashboard } from "@/components/role-dashboards";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Sales Pouch" }, { name: "description", content: "Dashboard Sales Pouch." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: p, isLoading } = useProfile();
  const fetchPermissions = useServerFn(getMyTeamPermissions);
  const { data: access } = useQuery({
    queryKey: ["my-team-permissions", p?.userId, p?.role],
    // Only Manager/Admin dashboards consume permissions.
    // Owner and Sales do not need this extra request on dashboard load.
    enabled: !!p && (p.role === "manager" || p.role === "admin"),
    queryFn: () => fetchPermissions({ data: {} }),
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading || !p) return <div className="min-h-screen p-10 text-center text-muted-foreground">Memuat dashboard…</div>;

  const superAdmin = isSuperAdminEmail(p.email);
  const testMode = superAdmin ? getTestMode() : null;
  const effectiveRole = superAdmin ? testMode ?? "super-admin" : p.role;
  const roleDefaults: Record<string, string[]> = {
    manager: ["team", "outlets", "schedule", "sales_stock", "transactions", "reports", "travel_funds", "notes", "operations", "expenses"],
    admin: ["team", "outlets", "schedule", "sales_stock", "transactions", "reports", "travel_funds", "notes", "operations", "expenses"],
  };
  // Keep the role defaults visible while the server permission request resolves.
  // Once the server responds, its saved permissions are authoritative.
  // Super Admin test mode is not a real team membership, so the server
  // correctly identifies that account as Owner. In Manager/Admin test mode,
  // use the selected role defaults instead of treating Owner's empty permission
  // list as "everything locked". Real Manager/Admin accounts still use the
  // Owner-saved permissions returned by the server.
  const permissions =
    (effectiveRole === "manager" || effectiveRole === "admin")
      ? access?.role === effectiveRole
        ? access.hasCustomPermissions
          ? access.permissions
          : (roleDefaults[effectiveRole] ?? [])
        : (roleDefaults[effectiveRole] ?? [])
      : [];

  if (effectiveRole === "super-admin") return <SuperAdminDashboard />;
  if (effectiveRole === "manager") return <ManagerDashboard profile={p.profile} businessName={p.profile?.business_name ?? null} permissions={permissions} />;
  if (effectiveRole === "admin") return <AdminDashboard profile={p.profile} businessName={p.profile?.business_name ?? null} permissions={permissions} />;
  if (effectiveRole === "sales") return <SalesDashboard profile={p.profile} businessName={p.profile?.business_name ?? null} salesUserId={p.userId} />;

  return <OwnerDashboard profile={p.profile} businessName={p.profile?.business_name ?? null} />;
}
