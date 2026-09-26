import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { rp } from "@/lib/visit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Daftar Produk — Sales Pouch" }, { name: "description", content: "Kelola daftar produk dan harga." }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  async function add() {
    const n = name.trim();
    if (!n || n.length > 80) { toast.error("Isi nama produk (maks 80 karakter)"); return; }
    const { error } = await supabase.from("products").insert({ name: n, price: Number(price.replace(/\D/g, "")) || 0 });
    if (error) { toast.error(error.code === "23505" ? "Produk sudah ada" : error.message); return; }
    setName(""); setPrice(""); refresh();
  }
  async function updatePrice(id: string, v: string) {
    const { error } = await supabase.from("products").update({ price: Number(v.replace(/\D/g, "")) || 0 }).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  const list = (products ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Daftar Produk</h1>
      <div className="mt-5 space-y-2 rounded-2xl border bg-card p-4">
        <Input placeholder="Nama produk" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        <Input placeholder="Harga (Rp)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11" />
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
          <div key={p.id} className="flex items-center gap-2 rounded-xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">{rp(p.price)}</div>
            </div>
            <Input key={p.price} defaultValue={p.price || ""} inputMode="numeric" className="h-10 w-28" aria-label="Harga"
              onBlur={(e) => { if (Number(e.target.value.replace(/\D/g, "")) !== p.price) void updatePrice(p.id, e.target.value); }} />
            <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </main>
  );
}
