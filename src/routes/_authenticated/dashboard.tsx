import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Plus, Store, LogOut, Package, Search, UserCog, ShieldCheck, Users, History, LockKeyhole, UserRoundCog, ChevronDown, UsersRound, MessageCircle, FileText, Wallet } from "lucide-react";
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
      if (search) { const safeSearch = search.replace(/[%_]/g, (char) => `\\${char}`); query = query.ilike("name", `%${safeSearch}%`); }
      const { data, error, count } = await query; if (error) throw error; return { data: data ?? [], count: count ?? 0 };
    }, staleTime: 30_000,
  });
  const outlets = outletResult?.data ?? [];
  const outletCount = outletResult?.count ?? 0;
  const isOwner = !!isAdmin || p?.role === "owner";
  const teamFeatures = LOCKED_FEATURES.filter((feature) => ["sales", "sales-kpi", "uang-jalan", "payroll"].includes(feature.id));
  const previewButton = (feature: (typeof LOCKED_FEATURES)[number]) => {
    if (feature.id === "sales") return <Button key={feature.id} asChild variant="outline" className="h-11 justify-between px-3"><Link to="/team"><span>{feature.label}</span><Users className="h-4 w-4 text-muted-foreground" /></Link></Button>;
    if (feature.id === "uang-jalan") return <Button key={feature.id} asChild variant="outline" className="h-11 justify-between px-3"><Link to="/travel-funds"><span>{feature.label}</span><Wallet className="h-4 w-4 text-muted-foreground" /></Link></Button>;
    return isOwner ? <Button key={feature.id} asChild variant="outline" className="h-11 justify-between px-3"><Link to="/feature-preview/$feature" params={{ feature: feature.id }}><span>{feature.label}</span><LockKeyhole className="h-4 w-4 text-muted-foreground" /></Link></Button> : <Button key={feature.id} type="button" variant="outline" disabled className="h-11 justify-between px-3 opacity-70"><span>{feature.label}</span><LockKeyhole className="h-4 w-4" /></Button>;
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-6">
      <header className="flex items-start justify-between"><div><div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div><h1 className="mt-1 text-2xl font-bold">{p?.profile?.business_name}</h1></div><div className="flex items-center gap-1">{isOwner && <Button asChild variant="ghost" size="icon" aria-label="Support"><a href="https://wa.me/6285783797770?text=Halo%20Super%20Admin%20Sales%20Pouch" target="_blank" rel="noreferrer"><MessageCircle className="h-5 w-5" /></a></Button>}<Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} aria-label="Keluar"><LogOut className="h-5 w-5" /></Button></div></header>
      {status?.reason === "trial" && status.trialEndsAt && <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">Trial aktif sampai <b>{status.trialEndsAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b></div>}

      {isOwner && <>
        {isAdmin && <Button asChild className="mt-4 h-10 w-full text-sm"><Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" />Dashboard Super Admin</Link></Button>}

        <section className="mt-5">
          <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Menu Utama</div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/products"><Package className="mr-1.5 h-4 w-4" />Master Produk</Link></Button>
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/stock-opening"><Package className="mr-1.5 h-4 w-4" />Stok Pembukaan</Link></Button>
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/profile"><UserCog className="mr-1.5 h-4 w-4" />Profil Usaha</Link></Button>
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/reports"><Package className="mr-1.5 h-4 w-4" />Laporan</Link></Button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Manajemen</div>
          <Button type="button" variant="outline" className="h-11 w-full justify-between rounded-xl" onClick={() => setTeamOpen((open) => !open)} aria-expanded={teamOpen}><span className="flex items-center"><Users className="mr-1.5 h-4 w-4" />Manajemen Tim</span><ChevronDown className={`h-4 w-4 transition-transform ${teamOpen ? "rotate-180" : ""}`} /></Button>
          {teamOpen && <section className="mt-2 rounded-2xl border bg-card p-3"><div className="flex items-center gap-2 px-1"><UserRoundCog className="h-4 w-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Manajemen Tim</h2><p className="text-xs text-muted-foreground">Kelola Sales dan kebutuhan tim.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2">{teamFeatures.map(previewButton)}</div></section>}

          <div className="mt-2"><Button type="button" variant="outline" className="h-11 w-full justify-between rounded-xl" onClick={() => setOutletOpen((open) => !open)} aria-expanded={outletOpen}><span className="flex items-center"><Store className="mr-1.5 h-4 w-4" />Manajemen Outlet</span><ChevronDown className={`h-4 w-4 transition-transform ${outletOpen ? "rotate-180" : ""}`} /></Button></div>
          {outletOpen && <section className="mt-2 rounded-2xl border bg-card p-3"><div className="flex items-center gap-2 px-1"><UsersRound className="h-4 w-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Manajemen Outlet</h2><p className="text-xs text-muted-foreground">Kelola outlet, jadwal, route, dan penugasan Sales.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><Button asChild variant="outline" className="h-11 justify-between px-3"><Link to="/outlets"><span>Semua Outlet</span><Store className="h-4 w-4 text-muted-foreground" /></Link></Button><Button asChild variant="outline" className="h-11 justify-between px-3"><Link to="/schedule"><span>Jadwal Toko</span><span className="text-xs text-muted-foreground">›</span></Link></Button><Button type="button" variant="outline" disabled className="h-11 justify-between px-3"><span>Penugasan Sales</span><LockKeyhole className="h-4 w-4 text-muted-foreground" /></Button></div></section>}
        </section>
      </>}

      {!isOwner && <Button asChild variant="outline" className="mt-5 h-11 w-full justify-between rounded-xl"><Link to="/travel-funds"><span className="flex items-center"><Wallet className="mr-1.5 h-4 w-4" />Uang Jalan</span><span className="text-xs text-muted-foreground">›</span></Link></Button>}

      <section className="mt-5">
        <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Catatan & Keuangan</div>
        <div className="space-y-2">
          <Button asChild variant="outline" className="h-11 w-full rounded-xl"><Link to="/notes"><FileText className="mr-1.5 h-4 w-4" />Catatan dan Pengeluaran</Link></Button>
          <Button asChild variant="outline" className="h-11 w-full rounded-xl"><Link to="/transactions"><History className="mr-1.5 h-4 w-4" />Riwayat Transaksi</Link></Button>
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between gap-3"><h2 className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Outlet ({outletCount})</h2>{outletCount > 50 && <span className="text-[11px] text-muted-foreground">50 terbaru</span>}</div>
        <div className="relative mt-3"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari toko…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-xl pl-9" /></div>
        <div className="mt-3 space-y-2">{isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}{!isLoading && outlets.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center"><Store className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{search ? "Outlet tidak ditemukan." : "Belum ada outlet. Tambahkan outlet pertama Anda."}</p></div>}{outlets.map((o) => <div key={o.id} className="flex items-center gap-2 rounded-xl border bg-card p-2"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Store className="h-5 w-5 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{o.name}</div>{o.owner_phone && <a href={`tel:${o.owner_phone}`} className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" />{o.owner_phone}</a>}{o.map_location && <a href={o.map_location.startsWith("http") ? o.map_location : `https://maps.google.com/?q=${encodeURIComponent(o.map_location)}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-accent underline"><MapPin className="h-3 w-3" />Peta</a>}</div><Button asChild size="sm" className="h-8 shrink-0 px-2"><Link to="/visit" search={{ outlet: o.id }}>Kunjungi</Link></Button></div>)}</div>
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background to-transparent px-5 pb-5 pt-8"><Button asChild size="lg" variant="outline" className="mb-2 h-11 w-full rounded-xl"><Link to="/visit" search={{ outlet: undefined }}>Mulai Kunjungan</Link></Button><Button asChild size="lg" className="h-12 w-full rounded-xl text-base"><Link to="/outlets/new"><Plus className="mr-1.5 h-5 w-5" />Tambah Outlet</Link></Button></div>
    </main>
  );
}
