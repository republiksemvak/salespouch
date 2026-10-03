import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronUp, Search, Trash2, Plus, X, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProducts, useStockSummary } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { rp } from "@/lib/visit";
import { formatQty, packSize, toPieces } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Daftar Produk — Sales Pouch" },
      { name: "description", content: "Kelola produk, harga, isi per pack, dan stok." },
      { property: "og:title", content: "Daftar Produk — Sales Pouch" },
      { property: "og:description", content: "Kelola produk, harga, isi per pack, dan stok." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

const toNum = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const whole = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);

function quantityAcrossProducts(rows: { pcs_per_pack: number; [key: string]: number | string }[], field: string) {
  const pieces = rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const sizes = new Set(rows.map((row) => packSize(row.pcs_per_pack)));
  return sizes.size === 1 ? formatQty(pieces, rows[0]?.pcs_per_pack) : `${pieces} pcs`;
}

function ProductsPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  if (accountLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (account?.role !== "owner") return <div className="p-10 text-center text-destructive">Hanya Owner yang dapat melihat Master Produk.</div>;
  return <OwnerProductsPage />;
}

function OwnerProductsPage() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const { data: summary } = useStockSummary();

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priceGrosir, setPriceGrosir] = useState("");
  const [priceAgen, setPriceAgen] = useState("");
  const [stockPack, setStockPack] = useState("");
  const [stockPcs, setStockPcs] = useState("");
  const [cost, setCost] = useState("");
  const [pack, setPack] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["stock-summary"] });
  };

  async function add() {
    const n = name.trim();
    if (!n || n.length > 80) return void toast.error("Isi nama produk (maks 80 karakter)");
    if (!Number.isInteger(Number(pack)) || Number(pack) < 1) return void toast.error("Isi jumlah pcs per pack minimal 1");
    if ((stockPack && !/^\d+$/.test(stockPack)) || (stockPcs && (!/^\d+$/.test(stockPcs) || Number(stockPcs) >= Number(pack)))) {
      return void toast.error("Sisa pcs harus lebih kecil dari isi per pack");
    }

    const { error } = await supabase.from("products").insert({
      name: n,
      price: toNum(price),
      price_grosir: toNum(priceGrosir),
      price_agen: toNum(priceAgen),
      cost_price: toNum(cost),
      warehouse_stock: toPieces(whole(stockPack), whole(stockPcs), Number(pack)),
      pcs_per_pack: Number(pack),
    });
    if (error) return void toast.error(error.code === "23505" ? "Produk sudah ada" : error.message);

    setName(""); setPrice(""); setPriceGrosir(""); setPriceAgen(""); setStockPack(""); setStockPcs(""); setCost(""); setPack("");
    setNewOpen(false);
    refresh();
    toast.success("Produk berhasil ditambahkan");
  }

  async function update(id: string, patch: { price?: number; price_grosir?: number; price_agen?: number; cost_price?: number; warehouse_stock?: number; pcs_per_pack?: number }) {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) return void toast.error(error.message);
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus produk ini?\n\nData produk akan dihapus.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    refresh();
    toast.success("Produk berhasil dihapus");
  }

  const k = (n: string) => n.trim().toLowerCase();
  const rows = (products ?? []).map((p) => {
    const toko = summary?.atStore.get(k(p.name)) ?? 0;
    const retur = summary?.returned.get(k(p.name)) ?? 0;
    return { ...p, toko, retur, total: toko + p.warehouse_stock };
  });

  const list = rows.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = rows.reduce((a, r) => ({
    toko: a.toko + r.toko,
    gudang: a.gudang + r.warehouse_stock,
    retur: a.retur + r.retur,
    total: a.total + r.total,
    nilaiGudang: a.nilaiGudang + r.warehouse_stock * (r.price / packSize(r.pcs_per_pack)),
    nilaiToko: a.nilaiToko + r.toko * (r.price / packSize(r.pcs_per_pack)),
  }), { toko: 0, gudang: 0, retur: 0, total: 0, nilaiGudang: 0, nilaiToko: 0 });

  const criticalCount = rows.filter((p) => p.warehouse_stock <= packSize(p.pcs_per_pack)).length;
  const editingProduct = rows.find((p) => p.id === editingId) ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Master Produk</h1>
          <p className="mt-1 text-xs text-muted-foreground">Kelola produk, harga, dan stok</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="h-10 shrink-0 rounded-xl">
          <Plus className="mr-1.5 h-4 w-4" /> Produk Baru
        </Button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-2 divide-x divide-y">
          <SummaryBox label="Total SKU" value={`${rows.length}`} />
          <SummaryBox label="Kritis / Habis" value={`${criticalCount}`} danger={criticalCount > 0} />
          <SummaryBox label="Nilai Gudang" value={rp(sum.nilaiGudang)} />
          <SummaryBox label="Nilai Toko" value={rp(sum.nilaiToko)} />
        </div>
      </div>

      <div className="relative mt-5">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari produk…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-xl pl-9" />
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <div className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">Memuat produk…</div>}
        {!isLoading && list.length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <div className="text-sm font-medium">Belum ada produk</div>
            <p className="mt-1 text-xs text-muted-foreground">Tambahkan produk pertama Anda.</p>
            <Button onClick={() => setNewOpen(true)} className="mt-4 rounded-xl"><Plus className="mr-1.5 h-4 w-4" /> Tambah Produk</Button>
          </div>
        )}
        {list.map((p) => (
          <ProductCard key={p.id} product={p} onEdit={() => setEditingId(p.id)} onDelete={() => remove(p.id)} />
        ))}
      </div>

      {rows.length > 0 && (
        <div className="mt-5 rounded-2xl border bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Stok Toko" v={quantityAcrossProducts(rows, "toko")} />
            <Stat label="Stok Gudang" v={quantityAcrossProducts(rows, "warehouse_stock")} />
            <Stat label="Retur" v={quantityAcrossProducts(rows, "retur")} />
            <Stat label="Total Stok" v={quantityAcrossProducts(rows, "total")} />
          </div>
        </div>
      )}

      <ResetPanel onDone={() => qc.invalidateQueries()} />

      {newOpen && (
        <Modal title="Produk Baru" onClose={() => setNewOpen(false)}>
          <div className="space-y-4">
            <Field label="Nama Produk" required>
              <Input autoFocus placeholder="Contoh: Minyak Goreng 2L" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HPP / pack"><Input placeholder="Rp 0" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11" /></Field>
              <Field label="Eceran / pack"><Input placeholder="Rp 0" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11" /></Field>
              <Field label="Grosir / pack"><Input placeholder="Rp 0" inputMode="numeric" value={priceGrosir} onChange={(e) => setPriceGrosir(e.target.value)} className="h-11" /></Field>
              <Field label="Agen / pack"><Input placeholder="Rp 0" inputMode="numeric" value={priceAgen} onChange={(e) => setPriceAgen(e.target.value)} className="h-11" /></Field>
            </div>
            <Field label="Isi per pack">
              <Input placeholder="Contoh: 6" type="number" min={1} step={1} value={pack} onChange={(e) => setPack(e.target.value)} className="h-11" />
              <p className="mt-1 text-[11px] text-muted-foreground">Berapa pcs dalam 1 pack.</p>
            </Field>
            <div className="border-t pt-4">
              <div className="mb-3 text-sm font-semibold">Stok Gudang Awal</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pack"><Input type="number" min={0} step={1} placeholder="0" value={stockPack} onChange={(e) => setStockPack(e.target.value)} className="h-11" /></Field>
                <Field label="Sisa pcs"><Input type="number" min={0} step={1} placeholder="0" value={stockPcs} onChange={(e) => setStockPcs(e.target.value)} className="h-11" /></Field>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setNewOpen(false)} className="h-11 flex-1 rounded-xl">Batal</Button>
              <Button onClick={add} className="h-11 flex-1 rounded-xl">Simpan Produk</Button>
            </div>
          </div>
        </Modal>
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            await update(editingProduct.id, patch);
            setEditingId(null);
          }}
        />
      )}
    </main>
  );
}

function ProductCard({ product, onEdit, onDelete }: { product: any; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const perPack = packSize(product.pcs_per_pack);
  const warehousePcs = Number(product.warehouse_stock) || 0;
  const storePcs = Number(product.toko) || 0;
  const totalPcs = warehousePcs + storePcs;
  const isOut = warehousePcs <= 0;
  const isCritical = warehousePcs > 0 && warehousePcs <= perPack;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/40"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 truncate text-[15px] font-bold">{product.name}</div>
            {(isOut || isCritical) && (
              <span className={isOut ? "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-bold text-destructive" : "shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-600"}>
                {isOut ? "HABIS" : "KRITIS"}
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">SKU · {product.id.slice(0, 8).toUpperCase()}</div>
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span>Gudang <b>{formatQty(warehousePcs, perPack)}</b></span>
            <span className="text-muted-foreground">•</span>
            <span>Toko <b>{formatQty(storePcs, perPack)}</b></span>
            <span className="text-muted-foreground">•</span>
            <span>Total <b>{formatQty(totalPcs, perPack)}</b></span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-[10px] text-muted-foreground">Eceran</div>
          <div className="text-sm font-bold">{rp(product.price || 0)}</div>
          {expanded ? <ChevronUp className="mt-1 h-4 w-4 text-muted-foreground" /> : <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/10 px-3.5 pb-3.5 pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <PriceText label="Eceran" value={product.price} />
            <PriceText label="Grosir" value={product.price_grosir || product.price} />
            <PriceText label="Agen" value={product.price_agen || product.price} />
            <PriceText label="HPP" value={product.cost_price} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kemasan</div>
              <div className="mt-0.5 text-sm font-semibold">1 pack = {perPack} pcs</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Harga / pcs</div>
              <div className="mt-0.5 text-sm font-semibold">{rp((product.price || 0) / perPack)}</div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-muted/40 p-3">
            <div className="grid grid-cols-3 gap-2">
              <StockBox label="Gudang" value={formatQty(warehousePcs, perPack)} />
              <StockBox label="Toko" value={formatQty(storePcs, perPack)} />
              <StockBox label="Total" value={formatQty(totalPcs, perPack)} />
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Nilai di toko</span><b>{rp(storePcs * ((product.price || 0) / perPack))}</b></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Nilai stok total</span><b>{rp(totalPcs * ((product.price || 0) / perPack))}</b></div>
          </div>

          <div className="mt-3 flex items-center border-t pt-2">
            <Button variant="ghost" onClick={onEdit} className="h-10 flex-1 text-sm">
              <Pencil className="mr-1.5 h-4 w-4" /> Atur Stok & Harga
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button variant="ghost" onClick={onDelete} className="h-10 w-10 text-muted-foreground hover:text-destructive" aria-label="Hapus produk">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditProductModal({ product, onClose, onSave }: { product: any; onClose: () => void; onSave: (patch: { price?: number; price_grosir?: number; price_agen?: number; cost_price?: number; warehouse_stock?: number; pcs_per_pack?: number }) => Promise<void> }) {
  const [price, setPrice] = useState(String(product.price || ""));
  const [priceGrosir, setPriceGrosir] = useState(String(product.price_grosir || ""));
  const [priceAgen, setPriceAgen] = useState(String(product.price_agen || ""));
  const [cost, setCost] = useState(String(product.cost_price || ""));
  const [pack, setPack] = useState(String(product.pcs_per_pack || ""));
  const perPack = packSize(Number(pack) || product.pcs_per_pack);
  const currentStock = Number(product.warehouse_stock) || 0;
  const [stockPack, setStockPack] = useState(String(Math.floor(currentStock / perPack)));
  const [stockPcs, setStockPcs] = useState(String(currentStock % perPack));

  async function save() {
    const newPack = Number(pack);
    if (!Number.isInteger(newPack) || newPack < 1) return void toast.error("Isi per pack minimal 1");
    if (stockPack && !/^\d+$/.test(stockPack)) return void toast.error("Stok pack harus berupa angka");
    if (stockPcs && (!/^\d+$/.test(stockPcs) || Number(stockPcs) >= newPack)) return void toast.error("Sisa pcs harus lebih kecil dari isi per pack");
    const newStock = toPieces(whole(stockPack), whole(stockPcs), newPack);
    await onSave({ price: toNum(price), price_grosir: toNum(priceGrosir), price_agen: toNum(priceAgen), cost_price: toNum(cost), pcs_per_pack: newPack, warehouse_stock: newStock });
    toast.success("Produk berhasil diperbarui");
  }

  return (
    <Modal title="Atur Stok & Harga" onClose={onClose}>
      <div className="mb-4 rounded-xl bg-muted/40 p-3"><div className="text-sm font-bold">{product.name}</div><div className="mt-1 text-xs text-muted-foreground">Ubah harga, kemasan, atau stok gudang.</div></div>
      <div className="space-y-4">
        <div>
          <div className="mb-3 text-sm font-semibold">Harga Produk</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="HPP / pack"><Input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11" /></Field>
            <Field label="Eceran / pack"><Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="h-11" /></Field>
            <Field label="Grosir / pack"><Input inputMode="numeric" value={priceGrosir} onChange={(e) => setPriceGrosir(e.target.value)} className="h-11" /></Field>
            <Field label="Agen / pack"><Input inputMode="numeric" value={priceAgen} onChange={(e) => setPriceAgen(e.target.value)} className="h-11" /></Field>
          </div>
        </div>
        <div className="border-t pt-4">
          <div className="mb-3 text-sm font-semibold">Kemasan</div>
          <Field label="Isi per pack"><Input type="number" min={1} step={1} value={pack} onChange={(e) => setPack(e.target.value)} className="h-11" /></Field>
        </div>
        <div className="border-t pt-4">
          <div className="mb-3 text-sm font-semibold">Stok Gudang</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pack"><Input type="number" min={0} step={1} value={stockPack} onChange={(e) => setStockPack(e.target.value)} className="h-11" /></Field>
            <Field label="Sisa pcs"><Input type="number" min={0} max={perPack - 1} step={1} value={stockPcs} onChange={(e) => setStockPcs(e.target.value)} className="h-11" /></Field>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">Total stok: <b className="text-foreground">{formatQty(toPieces(whole(stockPack), whole(stockPcs), perPack), perPack)}</b></div>
        </div>
        <div className="flex gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} className="h-11 flex-1 rounded-xl">Batal</Button>
          <Button onClick={() => void save()} className="h-11 flex-1 rounded-xl">Simpan Perubahan</Button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="Tutup"><X className="h-5 w-5" /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}{required && <span className="ml-0.5 text-destructive">*</span>}</div>{children}</label>;
}

function SummaryBox({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="p-4"><div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className={danger ? "mt-1 text-lg font-bold text-destructive" : "mt-1 text-lg font-bold"}>{value}</div></div>;
}

function PriceText({ label, value }: { label: string; value: number }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-semibold">{rp(value || 0)}</div></div>;
}

function StockBox({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-bold">{value}</div></div>;
}

function ResetPanel({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(kind: "outlets" | "stock") {
    const label = kind === "outlets" ? "SEMUA data toko beserta riwayat transaksi" : "stok gudang semua produk menjadi 0";
    if (!pw) return void toast.error("Masukkan password akun");
    if (!confirm(`Yakin reset ${label}?\n\nTidak bisa dibatalkan.`)) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    const { error: authErr } = email ? await supabase.auth.signInWithPassword({ email, password: pw }) : { error: new Error("x") };
    if (authErr) { setBusy(false); return void toast.error("Password salah"); }
    const { error } = kind === "outlets"
      ? await supabase.from("outlets").delete().not("id", "is", null)
      : await supabase.from("products").update({ warehouse_stock: 0 }).not("id", "is", null);
    setBusy(false);
    if (error) return void toast.error(error.message);
    setPw("");
    toast.success("Reset berhasil");
    onDone();
  }

  return (
    <div className="mt-10 space-y-2 rounded-2xl border border-destructive/40 p-4">
      <div className="font-semibold text-destructive">Reset Data</div>
      <p className="text-xs text-muted-foreground">Butuh password akun Anda.</p>
      <Input type="password" placeholder="Password akun" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" disabled={busy} onClick={() => void run("outlets")}>Reset Data Toko</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void run("stock")}>Reset Stok Gudang</Button>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold">{v}</div></div>;
}
