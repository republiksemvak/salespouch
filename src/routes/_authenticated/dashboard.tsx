import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Plus, Store, LogOut, Package, Boxes, Search, Building2, ShieldCheck, Users, History, LockKeyhole, UserRoundCog, ChevronDown, UsersRound, MessageCircle, FileText, Wallet, Play, BarChart3, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { accessStatus } from "@/lib/access";
import { LOCKED_FEATURES } from "@/lib/feature-locks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Outlet Saya — Sales Pouch" }, { name: "description", content: "Daftar outlet Anda." }, { property: "og:title", content: "Outlet Saya — Sales Pouch" }, { property: "og:description", content: "Daftar outlet Anda." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: p } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const [q, setQ] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [outletOpen, setOutletOpen] = useState(false);
  const search = q.trim();
  const status = p?.profile ? accessStatus(p.profile, p.email) : null;

  const { data: outletResult, isLoading } = useQuery({
    queryKey: ["outlets", search],
    queryFn: async () => {
      let query = supabase.from("outlets").select("id,name,owner_phone,map_location,created_at", { count: "exact" }).order("created_at", { ascending: false }).range(0, 49);
      if (search) {
        const safeSearch = search.replace(/[%_]/g, (char) => `\\${char}`);
        query = query.ilike("name", `%${safeSearch}%`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data: todayVisits = 0 } = useQuery({
    queryKey: ["dashboard-today-visits", todayKey],
    queryFn: async () => {
      const { count, error } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("visit_date", todayKey);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const outlets = outletResult?.data ?? [];
  const outletCount = outletResult?.count ?? 0;
  const isOwner = !!isAdmin || p?.role === "owner";
  const teamFeatures = LOCKED_FEATURES.filter((feature) => ["sales", "sales-kpi", "uang-jalan", "payroll"].includes(feature.id));

  const previewButton = (feature: (typeof LOCKED_FEATURES)[number]) => {
    if (feature.id === "sales") return <Button key={feature.id} asChild variant="outline" className="h-10 justify-between px-3 rounded-lg"><Link to="/team"><span>{feature.label}</span><Users className="h-4 w-4 text-muted-foreground" /></Link></Button>;
    if (feature.id === "uang-jalan") return <Button key={feature.id} asChild variant="outline" className="h-10 justify-between px-3 rounded-lg"><Link to="/travel-funds"><span>{feature.label}</span><Wallet className="h-4 w-4 text-muted-foreground" /></Link></Button>;
    return isOwner ? <Button key={feature.id} asChild variant="outline" className="h-10 justify-between px-3 rounded-lg"><Link to="/feature-preview/$feature" params={{ feature: feature.id }}><span>{feature.label}</span><LockKeyhole className="h-4 w-4 text-muted-foreground" /></Link></Button> : <Button key={feature.id} type="button" variant="outline" disabled className="h-10 justify-between px-3 rounded-lg opacity-70"><span>{feature.label}</span><LockKeyhole className="h-4 w-4 text-muted-foreground" /></Button>;
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-8 pt-5">
      <header className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Sales Pouch</div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">{p?.profile?.business_name}</h1>
        </div>
        <div className="flex items-center gap-1 pt-0.5">
          {isAdmin && <Button asChild variant="ghost" size="icon" aria-label="Dashboard Super Admin"><Link to="/admin"><ShieldCheck className="h-5 w-5" /></Link></Button>}
          {isOwner && <Button asChild variant="ghost" size="icon" aria-label="Support"><a href="https://wa.me/6285783797770?text=Halo%20Super%20Admin%20Sales%20Pouch" target="_blank" rel="noreferrer"><MessageCircle className="h-5 w-5" /></a></Button>}
          <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} aria-label="Keluar"><LogOut className="h-5 w-5" /></Button>
        </div>
      </header>

      {status?.reason === "trial" && status.trialEndsAt && <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm">Trial aktif sampai <b>{status.trialEndsAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b></div>}

      {isOwner && <>
        <section className="mt-4 rounded-xl border bg-card p-3 shadow-sm">
          <div className="grid grid-cols-2 divide-x">
            <div className="flex items-center gap-2.5 pr-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Store className="h-6 w-6" /></div>
              <div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Outlet</div><div className="text-2xl font-bold leading-none">{outletCount}</div><div className="mt-1 text-[11px] text-muted-foreground">Total toko aktif</div></div>
            </div>
            <div className="flex items-center gap-2.5 pl-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><ClipboardCheck className="h-6 w-6" /></div>
              <div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Kunjungan</div><div className="text-2xl font-bold leading-none">{todayVisits}</div><div className="mt-1 text-[11px] text-muted-foreground">Hari ini</div></div>
            </div>
          </div>
        </section>

        <section className="mt-4">
          <Button asChild className="h-14 w-full rounded-lg text-base font-semibold shadow-sm"><Link to="/visit" search={{ outlet: undefined }}><Play className="mr-3 h-5 w-5 fill-current" />Mulai Kunjungan</Link></Button>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Button asChild variant="outline" className="h-[78px] rounded-lg justify-between px-3.5"><Link to="/outlets/new"><span className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-700"><Plus className="h-5 w-5" /></span><span className="text-left text-[15px] font-semibold leading-tight">Tambah<br />Outlet</span></span><span className="text-xl text-orange-700">›</span></Link></Button>
            <Button asChild variant="outline" className="h-[78px] rounded-lg justify-between px-3.5"><Link to="/transactions"><span className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-800"><History className="h-5 w-5" /></span><span className="text-left text-[15px] font-semibold leading-tight">Riwayat<br />Transaksi</span></span><span className="text-xl text-orange-700">›</span></Link></Button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Menu Utama</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button asChild variant="outline" className="h-[92px] rounded-lg justify-between px-3.5"><Link to="/products"><span className="flex items-center gap-2.5"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Package className="h-7 w-7" /></span><span className="text-left text-[15px] font-semibold leading-tight">Master<br />Produk</span></span><span className="text-xl text-orange-700">›</span></Link></Button>
            <Button asChild variant="outline" className="h-[92px] rounded-lg justify-between px-3.5"><Link to="/stock-opening"><span className="flex items-center gap-2.5"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Boxes className="h-7 w-7" /></span><span className="text-left text-[15px] font-semibold leading-tight">Stok<br />Pembukaan</span></span><span className="text-xl text-blue-700">›</span></Link></Button>
            <Button asChild variant="outline" className="h-[92px] rounded-lg justify-between px-3.5"><Link to="/profile"><span className="flex items-center gap-2.5"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Building2 className="h-7 w-7" /></span><span className="text-left text-[15px] font-semibold leading-tight">Profil<br />Usaha</span></span><span className="text-xl text-emerald-700">›</span></Link></Button>
            <Button asChild variant="outline" className="h-[92px] rounded-lg justify-between px-3.5"><Link to="/reports"><span className="flex items-center gap-2.5"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700"><BarChart3 className="h-7 w-7" /></span><span className="text-left text-[15px] font-semibold leading-tight">Laporan</span></span><span className="text-xl text-purple-700">›</span></Link></Button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Manajemen</div>
          <Button type="button" variant="outline" className="h-12 w-full rounded-lg justify-between px-3.5" onClick={() => setTeamOpen((open) => !open)} aria-expanded={teamOpen}><span className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700"><Users className="h-5 w-5" /></span><span className="font-semibold">Manajemen Tim</span></span><ChevronDown className={`h-5 w-5 transition-transform ${teamOpen ? "rotate-180" : ""}`} /></Button>
          {teamOpen && <section className="mt-2 rounded-lg border bg-card p-3"><div className="flex items-center gap-2 px-1"><UserRoundCog className="h-4 w-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Manajemen Tim</h2><p className="text-xs text-muted-foreground">Kelola Sales dan kebutuhan tim.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2">{teamFeatures.map(previewButton)}</div></section>}
          <Button type="button" variant="outline" className="mt-2 h-12 w-full rounded-lg justify-between px-3.5" onClick={() => setOutletOpen((open) => !open)} aria-expanded={outletOpen}><span className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700"><Store className="h-5 w-5" /></span><span className="font-semibold">Manajemen Outlet</span></span><ChevronDown className={`h-5 w-5 transition-transform ${outletOpen ? "rotate-180" : ""}`} /></Button>
          {outletOpen && <section className="mt-2 rounded-lg border bg-card p-3"><div className="flex items-center gap-2 px-1"><UsersRound className="h-4 w-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Manajemen Outlet</h2><p className="text-xs text-muted-foreground">Kelola outlet, jadwal, route, dan penugasan Sales.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><Button asChild variant="outline" className="h-10 justify-between px-3 rounded-lg"><Link to="/outlets"><span>Semua Outlet</span><Store className="h-4 w-4 text-muted-foreground" /></Link></Button><Button asChild variant="outline" className="h-10 justify-between px-3 rounded-lg"><Link to="/schedule"><span>Jadwal Toko</span><span className="text-xs text-muted-foreground">›</span></Link></Button><Button type="button" variant="outline" disabled className="h-10 justify-between px-3 rounded-lg"><span>Penugasan Sales</span><LockKeyhole className="h-4 w-4 text-muted-foreground" /></Button></div></section>}
        </section>
      </>}

      {!isOwner && <Button asChild variant="outline" className="mt-5 h-12 w-full rounded-lg justify-between"><Link to="/travel-funds"><span className="flex items-center gap-2.5"><Wallet className="h-5 w-5" />Uang Jalan</span><span className="text-xs text-muted-foreground">›</span></Link></Button>}

      <section className="mt-5">
        <div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Catatan & Pengeluaran</div>
        <Button asChild variant="outline" className="h-14 w-full rounded-lg justify-between px-3.5"><Link to="/notes"><span className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700"><FileText className="h-5 w-5" /></span><span className="font-semibold">Catatan dan Pengeluaran</span></span><span className="text-xl text-orange-700">›</span></Link></Button>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Outlet ({outletCount})</h2>{outletCount > 50 && <span className="text-[11px] text-muted-foreground">50 terbaru</span>}</div>
        <div className="relative mt-2.5"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input placeholder="Cari toko..." value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-lg pl-9" /></div>
        <div className="mt-2.5 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
          {!isLoading && outlets.length === 0 && <div className="rounded-lg border border-dashed p-7 text-center"><Store className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{search ? "Outlet tidak ditemukan." : "Belum ada outlet. Tambahkan outlet pertama Anda."}</p></div>}
          {outlets.map((o) => <div key={o.id} className="flex items-center gap-2 rounded-lg border bg-card p-2"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Store className="h-5 w-5 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{o.name}</div>{o.owner_phone && <a href={`tel:${o.owner_phone}`} className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" />{o.owner_phone}</a>}{o.map_location && <a href={o.map_location.startsWith("http") ? o.map_location : `https://maps.google.com/?q=${encodeURIComponent(o.map_location)}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-accent underline"><MapPin className="h-3 w-3" />Peta</a>}</div><Button asChild size="sm" className="h-8 shrink-0 rounded-lg px-2"><Link to="/visit" search={{ outlet: o.id }}>Kunjungi</Link></Button></div>)}
        </div>
        <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-lg"><Link to="/visit" search={{ outlet: undefined }}><Play className="mr-2 h-4 w-4" />Mulai Kunjungan</Link></Button>
        <Button asChild className="mt-2 h-14 w-full rounded-lg text-base"><Link to="/outlets/new"><Plus className="mr-2 h-5 w-5" />Tambah Outlet</Link></Button>
      </section>
    </main>
  );
}
