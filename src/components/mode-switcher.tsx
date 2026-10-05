import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, LogIn, ShieldCheck, Users, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isSuperAdminEmail } from "@/lib/access";
import { getTestMode, setTestMode, type TestMode } from "@/lib/test-mode";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

const labels: Record<TestMode | "super-admin", string> = {
  "super-admin": "Super Admin",
  owner: "Owner",
  manager: "Manager",
  sales: "Sales",
};

export function ModeSwitcher() {
  const { data: profileData } = useProfile();
  const [open, setOpen] = useState(false);
  const email = profileData?.email;
  const superAdmin = isSuperAdminEmail(email);
  const testMode = superAdmin ? getTestMode() : null;
  const role = superAdmin ? testMode ?? "super-admin" : profileData?.role ?? "owner";
  const isOwner = role === "owner";

  if (!profileData) return null;

  const activateTestMode = (mode: TestMode) => {
    setTestMode(mode);
    setOpen(false);
    window.location.reload();
  };

  const clearTestMode = () => {
    setTestMode(null);
    setOpen(false);
    window.location.reload();
  };

  const loginAs = async (target: "manager" | "sales") => {
    setOpen(false);
    await supabase.auth.signOut();
    window.location.assign(`/auth?login_as=${target}`);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-lg px-2.5 text-xs font-semibold shadow-none"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {role === "super-admin" ? <ShieldCheck className="mr-1.5 h-4 w-4" /> : <UserRound className="mr-1.5 h-4 w-4" />}
        <span>{labels[role as keyof typeof labels]}</span>
        <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border bg-card p-1.5 shadow-lg" role="menu">
          {superAdmin ? (
            <>
              <div className="px-2.5 py-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Mode</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Super Admin bisa menguji tampilan role tanpa mengubah akun.</div>
              </div>
              {testMode && (
                <button type="button" onClick={clearTestMode} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                  <ShieldCheck className="h-4 w-4" />
                  Kembali ke Super Admin
                </button>
              )}
              {!testMode && (
                <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted">
                  <ShieldCheck className="h-4 w-4" />
                  Dashboard Super Admin
                </Link>
              )}
              <button type="button" onClick={() => activateTestMode("owner")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                <UserRound className="h-4 w-4" />
                Owner <span className="ml-auto text-[10px] text-muted-foreground">TEST</span>
              </button>
              <button type="button" onClick={() => activateTestMode("manager")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                <Users className="h-4 w-4" />
                Manager <span className="ml-auto text-[10px] text-muted-foreground">TEST</span>
              </button>
              <button type="button" onClick={() => activateTestMode("sales")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                <UserRound className="h-4 w-4" />
                Sales <span className="ml-auto text-[10px] text-muted-foreground">TEST</span>
              </button>
            </>
          ) : isOwner ? (
            <>
              <div className="px-2.5 py-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Login Tim</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Keluar dari Owner lalu masuk memakai akun tim.</div>
              </div>
              <button type="button" onClick={() => loginAs("manager")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                <LogIn className="h-4 w-4" />
                Login Manager
              </button>
              <button type="button" onClick={() => loginAs("sales")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                <LogIn className="h-4 w-4" />
                Login Sales
              </button>
            </>
          ) : (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">Mode {labels[role as keyof typeof labels]}</div>
          )}
        </div>
      )}
    </div>
  );
}
