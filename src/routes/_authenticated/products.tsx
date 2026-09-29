import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, useStockSummary } from "@/lib/products";
import { rp } from "@/lib/visit";
import { formatQty, packSize } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Daftar Produk — Sales Pouch" }, { name: "description", content: "Kelola daftar produk dan harga." }] }),
  component: ProductsPage,
});

const toNum = (v: string) => Number(v.replace(/\D/g, "")) || 0;

function ProductsPage() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const { data: summary } = useStockSummary();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [cost, setCost] = useState("");
  const [pack, setPack] = useState("1");
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  async function add() {
    const n = name.trim();
    if (!n || n.length > 80) { toast.error("Isi nama produk (maks 80 karakter)"); return; }
    if (!Number.isInteger(Number(pack)) || Number(pack) < 1) { toast.error("Isi jumlah pcs per pack minimal 1"); return; }
    const { error } = await supabase.from("products").insert({ name: n, price: toNum(price), cost_price: toNum(cost), warehouse_stock: toNum(stock), pcs_per_pack: Number(pack) });
    if (error) { toast.error(error.code === "23505" ? "Produk sudah ada" : error.message); return; }
    setName(""); setPrice(""); setStock(""); setCost(""); setPack("1"); refresh();
  }
  async function update(id: string, patch: { price?: number; price_grosir?: number; price_agen?: number; cost_price?: number; warehouse_stock?: number; pcs_per_pack?: number }) {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function remove(id: string) {
    if (!confirm("Hapus produk ini?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  const k = (n: string) => n.trim().toLowerCase();
  const rows = (products ?? []).map((p) => {
    const toko = summary?.atStore.get(k(p.name)) ?? 0;
    const retur = summary?.returned.get(k(p.name)) ?? 0;
    return { ...p, toko, retur, total: toko + p.warehouse_stock };
  });
  const list = rows.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = rows.reduce((a, r) => ({ toko: a.toko + r.toko, gudang: a.gudang + r.warehouse_stock, retur: a.retur + r.retur, total: a.total + r.total, nilai: a.nilai + r.total * r.price, nilaiToko: a.nilaiToko + r.toko * r.price }), { toko: 0, gudang: 0, retur: 0, total: 0, nilai: 0, nilaiToko: 0 });

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Master Produk</h1>

      <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border bg-card p-3 text-center">
        <Stat label="Di toko" v={sum.toko} /><Stat label="Gudang" v={sum.gudang} /><Stat label="Retur" v={sum.retur} /><Stat label="Total" v={sum.total} />
        <div className="col-span-4 rounded-xl bg-primary/10 p-2 text-sm">Uang di toko (belum ditagih): <b className="text-primary">{rp(sum.nilaiToko)}</b></div>
        <div className="col-span-4 border-t border-dashed pt-2 text-xs text-muted-foreground">Nilai stok (toko + gudang): <b className="text-foreground">{rp(sum.nilai)}</b></div>
      </div>

      <div className="mt-5 space-y-2 rounded-2xl border bg-card p-4">
        <Input placeholder="Nama produk" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Harga Modal / HPP (Rp)" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11" />
          <Input placeholder="Harga Jual (Rp)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11" />
           <Input placeholder="Isi per pack (pcs)" type="number" min={1} step={1} value={pack} onChange={(e) => setPack(e.target.value)} className="h-11" />
           <Input placeholder="Stok gudang (pcs)" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className="h-11" />
        </div>
        <Button onClick={add} className="h-12 w-full">Tambah Produk</Button>
      </div>
      <div className="relative mt-6">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari produk…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>
      <div className="mt-3 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">Belum ada produk.</p>}
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate font-medium">{p.name}</div>
              <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
            </div>
             <div className="mt-1 grid grid-cols-2 gap-2">
               <label className="text-[11px] text-muted-foreground">Isi per pack (pcs)
                 <Input key={"u" + p.pcs_per_pack} defaultValue={p.pcs_per_pack} type="number" min={1} step={1} className="h-10"
                   onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v !== p.pcs_per_pack) void update(p.id, { pcs_per_pack: v }); else if (!Number.isInteger(v) || v < 1) e.target.value = String(p.pcs_per_pack); }} />
               </label>
               <div className="self-end pb-2 text-xs text-muted-foreground">Harga/pcs: <b className="text-foreground">{rp(p.price / packSize(p.pcs_per_pack))}</b></div>
              <label className="text-[11px] text-muted-foreground">HPP
                <Input key={"c" + p.cost_price} defaultValue={p.cost_price || ""} inputMode="numeric" className="h-10"
                  onBlur={(e) => { if (toNum(e.target.value) !== p.cost_price) void update(p.id, { cost_price: toNum(e.target.value) }); }} />
              </label>
              <label className="text-[11px] text-muted-foreground">Harga eceran
                <Input key={"p" + p.price} defaultValue={p.price || ""} inputMode="numeric" className="h-10"
                  onBlur={(e) => { if (toNum(e.target.value) !== p.price) void update(p.id, { price: toNum(e.target.value) }); }} />
              </label>
              <label className="text-[11px] text-muted-foreground">Harga grosir
                <Input key={"g" + p.price_grosir} defaultValue={p.price_grosir || ""} placeholder="= eceran" inputMode="numeric" className="h-10"
                  onBlur={(e) => { if (toNum(e.target.value) !== p.price_grosir) void update(p.id, { price_grosir: toNum(e.target.value) }); }} />
              </label>
              <label className="text-[11px] text-muted-foreground">Harga agen
                <Input key={"a" + p.price_agen} defaultValue={p.price_agen || ""} placeholder="= eceran" inputMode="numeric" className="h-10"
                  onBlur={(e) => { if (toNum(e.target.value) !== p.price_agen) void update(p.id, { price_agen: toNum(e.target.value) }); }} />
              </label>
               <label className="text-[11px] text-muted-foreground">Stok gudang (pcs)
                <Input key={"s" + p.warehouse_stock} defaultValue={p.warehouse_stock || ""} inputMode="numeric" className="h-10"
                  onBlur={(e) => { if (toNum(e.target.value) !== p.warehouse_stock) void update(p.id, { warehouse_stock: toNum(e.target.value) }); }} />
              </label>
            </div>
             <div className="mt-2 text-xs text-muted-foreground">Gudang: {formatQty(p.warehouse_stock, p.pcs_per_pack)} · Toko: {formatQty(p.toko, p.pcs_per_pack)}</div>
             <div className="mt-2 grid grid-cols-4 gap-1 text-center font-mono text-xs">
              <Stat label="Di toko" v={p.toko} /><Stat label="Gudang" v={p.warehouse_stock} /><Stat label="Retur" v={p.retur} /><Stat label="Total" v={p.total} />
            </div>
             <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Di toko: <b className="text-foreground">{rp(p.toko * p.price / packSize(p.pcs_per_pack))}</b></span><span>Subtotal nilai: <b className="text-foreground">{rp(p.total * p.price / packSize(p.pcs_per_pack))}</b></span></div>
             <div className="mt-1 text-xs text-muted-foreground">Margin/pcs: <b className={p.price - p.cost_price < 0 ? "text-destructive" : "text-primary"}>{rp((p.price - p.cost_price) / packSize(p.pcs_per_pack))}</b></div>
          </div>
        ))}
      </div>
      <ResetPanel onDone={() => qc.invalidateQueries()} />
    </main>
  );
}

function ResetPanel({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(kind: "outlets" | "stock") {
    const label = kind === "outlets" ? "SEMUA data toko beserta riwayat transaksinya" : "stok gudang semua produk menjadi 0";
    if (!pw) { toast.error("Masukkan password akun"); return; }
    if (!confirm(`Yakin reset ${label}? Tidak bisa dibatalkan.`)) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    const { error: authErr } = email ? await supabase.auth.signInWithPassword({ email, password: pw }) : { error: new Error("x") };
    if (authErr) { setBusy(false); toast.error("Password salah"); return; }
    const { error } = kind === "outlets"
      ? await supabase.from("outlets").delete().not("id", "is", null)
      : await supabase.from("products").update({ warehouse_stock: 0 }).not("id", "is", null);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPw(""); toast.success("Reset berhasil"); onDone();
  }
  return (
    <div className="mt-10 space-y-2 rounded-2xl border border-destructive/40 p-4">
      <div className="font-semibold text-destructive">Reset Data</div>
      <p className="text-xs text-muted-foreground">Butuh password akun Anda.</p>
      <Input type="password" placeholder="Password akun" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" disabled={busy} onClick={() => run("outlets")}>Reset Data Toko</Button>
        <Button variant="destructive" disabled={busy} onClick={() => run("stock")}>Reset Stok Gudang</Button>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="font-semibold">{v}</div></div>;
}
