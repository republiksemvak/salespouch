import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, profileQueryKey } from "@/hooks/use-profile";
import { accessStatus, ADMIN_TELEGRAM, ADMIN_WHATSAPP } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const businessCategories = ["Makanan & Minuman", "Sembako", "Snack / Keripik", "Kosmetik", "Fashion", "Distributor", "Retail", "Grosir", "Lainnya"];
const businessModels = ["Titip Jual", "Cash", "Grosir", "Retail", "Campuran", "Lainnya"];

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Gate,
});

function Gate() {
  const { data, isLoading, error } = useProfile();
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  if (error || !data?.profile) return <div className="p-10 text-center text-destructive">Profil tidak ditemukan.</div>;
  const status = accessStatus(data.profile, data.email);
  if (!status.allowed) return <Blocked />;
  const incomplete = !data.profile.business_name || !data.profile.business_category || !data.profile.business_model || !data.profile.main_product;
  if (data.role === "owner" && incomplete) return <Setup profile={data.profile} />;
  return <Outlet />;
}

function Blocked() {
  const { data: pkgs } = useQuery({
    queryKey: ["packages-public"],
    queryFn: async () => (await supabase.from("license_packages").select("*").eq("active", true).order("days")).data ?? [],
  });
  const { data: promos } = useQuery({
    queryKey: ["promos-public"],
    queryFn: async () => (await supabase.from("promos").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <div className="text-5xl">⏳</div>
      <p className="mt-6 text-lg font-medium">Masa trial 24 jam Anda telah berakhir. Silakan hubungi admin untuk memperpanjang lisensi.</p>
      {!!pkgs?.length && <div className="mt-6 w-full space-y-2 text-left">{pkgs.map((p) => <div key={p.id} className="flex justify-between rounded-xl border bg-card px-4 py-3 text-sm"><span className="font-medium">{p.name} <span className="text-muted-foreground">({p.days} hari)</span></span><span className="font-mono">Rp {Number(p.price).toLocaleString("id-ID")}</span></div>)}</div>}
      {!!promos?.length && <div className="mt-3 w-full space-y-2 text-left">{promos.map((p) => <div key={p.id} className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm">Promo <b className="font-mono">{p.code}</b>{p.discount_percent > 0 && <> · diskon {p.discount_percent}%</>}{p.bonus_days > 0 && <> · bonus {p.bonus_days} hari</>}{p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}</div>)}</div>}
      <Button asChild size="lg" className="mt-8 h-14 w-full"><a href={ADMIN_WHATSAPP} target="_blank" rel="noreferrer">Hubungi Admin via WhatsApp</a></Button>
      <Button asChild size="lg" variant="outline" className="mt-2 h-12 w-full"><a href={ADMIN_TELEGRAM} target="_blank" rel="noreferrer">Telegram @salespouch</a></Button>
      <button className="mt-4 text-sm text-muted-foreground underline" onClick={() => supabase.auth.signOut()}>Keluar</button>
    </main>
  );
}

function Setup({ profile }: { profile: { business_name: string | null; business_category: string | null; business_model: string | null; main_product: string | null } }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.business_name ?? "");
  const [category, setCategory] = useState(profile.business_category ?? "");
  const [model, setModel] = useState(profile.business_model ?? "");
  const [product, setProduct] = useState(profile.main_product ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !category || !model || !product.trim()) {
      toast.error("Semua data usaha wajib diisi");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); toast.error("Akun tidak ditemukan"); return; }
    const db = supabase as any;
    const { error } = await db.from("profiles").update({
      business_name: name.trim(),
      business_category: category,
      business_model: model,
      main_product: product.trim(),
    }).eq("id", u.user.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Data usaha berhasil disimpan");
    qc.invalidateQueries({ queryKey: profileQueryKey });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-8">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Lengkapi data usaha</div>
      <h1 className="mt-3 text-3xl font-bold">Kenali bisnis Anda</h1>
      <p className="mt-2 text-sm text-muted-foreground">Data ini membantu Sales Pouch memahami jenis bisnis pengguna dan mengembangkan fitur yang lebih sesuai. Lengkapi sebelum melanjutkan ke aplikasi.</p>
      <form onSubmit={save} className="mt-7 space-y-4">
        <div className="space-y-2"><Label>Nama Usaha</Label><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. CV Kripik Mantap" className="h-12" /></div>
        <div className="space-y-2"><Label>Jenis Usaha</Label><select required value={category} onChange={(e) => setCategory(e.target.value)} className="h-12 w-full rounded-md border bg-background px-3 text-sm"><option value="">Pilih jenis usaha…</option>{businessCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="space-y-2"><Label>Model Penjualan Utama</Label><select required value={model} onChange={(e) => setModel(e.target.value)} className="h-12 w-full rounded-md border bg-background px-3 text-sm"><option value="">Pilih model penjualan…</option>{businessModels.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="space-y-2"><Label>Produk Utama yang Dijual</Label><Input required maxLength={100} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="cth. Keripik pisang, minuman, kosmetik" className="h-12" /></div>
        <Button disabled={busy || !name.trim() || !category || !model || !product.trim()} className="h-12 w-full">{busy ? "Menyimpan…" : "Simpan & Lanjut"}</Button>
      </form>
    </main>
  );
}
