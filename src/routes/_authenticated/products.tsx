import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Package, Plus, Search, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Daftar Produk — Sales Pouch" }, { name: "description", content: "Kelola master produk dan harga. Stok dikelola melalui Master Stok." }] }),
  component: ProductsPage,
});

const toNum = (v: string) => Number(v.replace(/\D/g, "")) || 0;
type ProductForm = { name: string; price: string; priceGrosir: string; priceAgen: string; cost: string; pack: string };
const emptyForm: ProductForm = { name: "", price: "", priceGrosir: "", priceAgen: "", cost: "", pack: "" };

function ProductsPage() {
  const { data: account, isLoading } = useProfile();
  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (!account || !["owner", "manager", "admin"].includes(account.role)) return <div className="p-10 text-center text-destructive">Akses akun tidak tersedia.</div>;
  return <OwnerProductsPage />;
}

function OwnerProductsPage() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["master-stock-global"] }); };
  const openNew = () => { setForm(emptyForm); setNewOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ name: p.name ?? "", price: String(p.price ?? ""), priceGrosir: String(p.price_grosir ?? ""), priceAgen: String(p.price_agen ?? ""), cost: String(p.cost_price ?? ""), pack: String(p.pcs_per_pack ?? "1") }); };

  async function saveNew() {
    const name = form.name.trim(); const pack = Number(form.pack);
    if (!name || name.length > 80) return void toast.error("Isi nama produk (maks 80 karakter)");
    if (!Number.isInteger(pack) || pack < 1) return void toast.error("Isi jumlah pcs per pack minimal 1");
    const { error } = await supabase.from("products").insert({ name, price: toNum(form.price), price_grosir: toNum(form.priceGrosir), price_agen: toNum(form.priceAgen), cost_price: toNum(form.cost), warehouse_stock: 0, pcs_per_pack: pack });
    if (error) return void toast.error(error.code === "23505" ? "Produk sudah ada" : error.message);
    setNewOpen(false); setForm(emptyForm); refresh(); toast.success("Produk berhasil ditambahkan. Stok awal diatur melalui Master Stok.");
  }

  async function saveEdit() {
    if (!editing) return; const pack = Number(form.pack);
    if (!Number.isInteger(pack) || pack < 1) return void toast.error("Isi jumlah pcs per pack minimal 1");
    const { error } = await supabase.from("products").update({ price: toNum(form.price), price_grosir: toNum(form.priceGrosir), price_agen: toNum(form.priceAgen), cost_price: toNum(form.cost), pcs_per_pack: pack }).eq("id", editing.id);
    if (error) return void toast.error(error.message);
    setEditing(null); refresh(); toast.success("Produk diperbarui");
  }

  async function remove(p: any) {
    if (!confirm(`Hapus produk ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return void toast.error(error.message);
    refresh(); toast.success("Produk berhasil dihapus");
  }

  const list = products.filter((p: any) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
    <div className="mt-4 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Master Produk</h1><p className="mt-1 text-xs text-muted-foreground">Kelola data barang, harga, dan isi per pack.</p></div><Button onClick={openNew} className="h-10 shrink-0 rounded-xl"><Plus className="mr-1.5 h-4 w-4" /> Produk Baru</Button></div>
    <div className="mt-4 rounded-2xl border bg-blue-50 p-4 text-xs leading-5 text-blue-950"><div className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4" /> Stok dikelola di Master Stok</div><p className="mt-1">Master Produk hanya menyimpan identitas dan konfigurasi barang. Produk baru otomatis mulai <b>0 pcs</b>. Stok Pembukaan, Produksi/Stok Masuk, Transfer, Retur, dan Penyesuaian dilakukan melalui <Link to="/master-stock" className="font-semibold underline">Master Stok</Link>.</p></div>
    <div className="relative mt-4"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk…" className="h-11 rounded-xl pl-9" /></div>
    <div className="mt-4 space-y-2">{isLoading && <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">Memuat produk…</div>}{!isLoading && list.length === 0 && <div className="rounded-2xl border p-8 text-center"><Package className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 text-sm font-medium">Belum ada produk</div><Button onClick={openNew} className="mt-4 rounded-xl"><Plus className="mr-1.5 h-4 w-4" /> Tambah Produk</Button></div>}{list.map((p: any) => <div key={p.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="mt-1 text-xs text-muted-foreground">{p.pcs_per_pack || 1} pcs/pack · Stok dikelola di Master Stok</div></div><div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button></div></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-muted/50 p-2"><div className="text-muted-foreground">HPP / pack</div><b>Rp {Number(p.cost_price || 0).toLocaleString("id-ID")}</b></div><div className="rounded-xl bg-muted/50 p-2"><div className="text-muted-foreground">Eceran / pack</div><b>Rp {Number(p.price || 0).toLocaleString("id-ID")}</b></div></div></div>)}</div>
    {(newOpen || editing) && <ProductModal title={editing ? "Edit Produk" : "Produk Baru"} form={form} setForm={setForm} onClose={() => { setNewOpen(false); setEditing(null); }} onSave={editing ? saveEdit : saveNew} />}
  </main>;
}

function ProductModal({ title, form, setForm, onClose, onSave }: { title: string; form: ProductForm; setForm: React.Dispatch<React.SetStateAction<ProductForm>>; onClose: () => void; onSave: () => void }) {
  const field = (key: keyof ProductForm, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="space-y-4"><label className="block text-sm font-medium">Nama Produk *<Input autoFocus maxLength={80} value={form.name} onChange={(e) => field("name", e.target.value)} className="mt-1.5 h-11" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">HPP / pack<Input inputMode="numeric" value={form.cost} onChange={(e) => field("cost", e.target.value)} className="mt-1.5 h-11" /></label><label className="text-sm font-medium">Eceran / pack<Input inputMode="numeric" value={form.price} onChange={(e) => field("price", e.target.value)} className="mt-1.5 h-11" /></label><label className="text-sm font-medium">Grosir / pack<Input inputMode="numeric" value={form.priceGrosir} onChange={(e) => field("priceGrosir", e.target.value)} className="mt-1.5 h-11" /></label><label className="text-sm font-medium">Agen / pack<Input inputMode="numeric" value={form.priceAgen} onChange={(e) => field("priceAgen", e.target.value)} className="mt-1.5 h-11" /></label></div><label className="block text-sm font-medium">Isi per pack<Input type="number" min={1} step={1} value={form.pack} onChange={(e) => field("pack", e.target.value)} className="mt-1.5 h-11" /><span className="mt-1 block text-[11px] text-muted-foreground">Contoh: 6 berarti 1 pack = 6 pcs.</span></label><div className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Tidak ada input stok di sini. Produk baru selalu dibuat dengan stok <b>0 pcs</b>. Atur stok melalui <b>Master Stok</b>.</div><div className="flex gap-2 pt-1"><Button variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Batal</Button><Button onClick={onSave} className="h-11 flex-1 rounded-xl">Simpan</Button></div></div></div></div>;
}
