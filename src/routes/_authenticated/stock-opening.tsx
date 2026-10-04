import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Check, ChevronRight, RefreshCw, Sparkles, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/stock-opening")({
  head: () => ({
    meta: [
      { title: "Stok Pembukaan — Sales Pouch" },
      { name: "description", content: "Atur cara memulai stok di Sales Pouch." },
    ],
  }),
  component: OpeningStockPage,
});

type SetupMode = "migration" | "from_start";

type StockSetup = {
  id: string;
  mode: SetupMode;
  status: "active" | "finalized";
  started_at: string;
  finalized_at: string | null;
};

function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const qc = useQueryClient();
  const [savingMode, setSavingMode] = useState<SetupMode | null>(null);

  const { data: setup, isLoading: setupLoading } = useQuery<StockSetup | null>({
    queryKey: ["stock-setup", account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_setups")
        .select("id,mode,status,started_at,finalized_at")
        .eq("owner_id", account!.ownerId)
        .maybeSingle();
      if (error) throw error;
      return data as StockSetup | null;
    },
  });

  const modeLabel = useMemo(() => {
    if (setup?.mode === "migration") return "Migrasi Usaha";
    if (setup?.mode === "from_start") return "Mulai dari Awal";
    return "";
  }, [setup]);

  async function chooseMode(mode: SetupMode) {
    if (!account?.ownerId || savingMode) return;
    setSavingMode(mode);
    try {
      const { data, error } = await (supabase as any)
        .from("stock_setups")
        .insert({ owner_id: account.ownerId, mode, status: "active" })
        .select("id,mode,status,started_at,finalized_at")
        .single();
      if (error) throw error;
      qc.setQueryData(["stock-setup", account.ownerId], data);
      toast.success(`${mode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"} dipilih.`);
    } catch (error) {
      toast.error(`Gagal menyimpan pilihan: ${(error as Error).message}`);
    } finally {
      setSavingMode(null);
    }
  }

  if (accountLoading || setupLoading) {
    return <main className="mx-auto min-h-screen max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat pengaturan stok…</main>;
  }

  if (account?.role !== "owner") {
    return <main className="mx-auto min-h-screen max-w-md px-4 pt-12 text-center text-destructive">Hanya Owner yang dapat mengatur stok pembukaan.</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
      </Link>

      <header className="mt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stok Pembukaan</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Tentukan bagaimana stok usaha Anda mulai dicatat di Sales Pouch.</p>
          </div>
        </div>
      </header>

      {!setup && (
        <>
          <section className="mt-6 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-orange-600" /> Pilih cara memulai
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Pilihan ini hanya dibuat sekali. Setelah dipilih, kita lanjut mengisi stok Gudang, Toko, dan Sales sesuai kondisi usaha.
            </p>
          </section>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => chooseMode("migration")}
              disabled={!!savingMode}
              className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-60"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold">Usaha sudah berjalan</h2>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Pilih <b>Migrasi Usaha</b>. Anda bisa memasukkan stok awal bertahap sambil usaha tetap berjalan.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-medium text-orange-800">Bertahap</span>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium">Tetap beroperasi</span>
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => chooseMode("from_start")}
              disabled={!!savingMode}
              className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Warehouse className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold">Usaha baru / mulai dari awal</h2>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Pilih <b>Mulai dari Awal</b>. Masukkan seluruh stok awal sebelum pencatatan stok berjalan dimulai.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-800">Sekali isi</span>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium">Lalu dikunci</span>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <p className="mt-5 text-center text-[10px] leading-relaxed text-muted-foreground">
            Stok Pembukaan bukan transaksi harian. Setelah final, perubahan stok dicatat melalui Stok In, Stok Out, Transfer, Retur, atau Penyesuaian.
          </p>
        </>
      )}

      {setup && (
        <section className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Mode stok aktif</div>
              <h2 className="text-lg font-bold">{modeLabel}</h2>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed">
            {setup.mode === "migration"
              ? "Usaha tetap bisa berjalan. Stok awal dapat dimasukkan bertahap per lokasi, lalu dikunci setelah migrasi selesai."
              : "Masukkan seluruh stok awal per lokasi sebelum setup difinalkan. Setelah final, Stok Pembukaan tidak dapat dibuka kembali."
            }
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <span>Status setup</span>
              <span className="font-semibold text-emerald-700">{setup.status === "active" ? "Aktif" : "Final"}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <span>Langkah berikutnya</span>
              <span className="font-semibold">Isi stok per lokasi</span>
            </div>
          </div>

          <Button className="mt-4 h-11 w-full rounded-xl" disabled>
            <Warehouse className="mr-2 h-4 w-4" /> Isi Stok Pembukaan
          </Button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Form Gudang, Toko, dan Sales akan kita sambungkan di langkah berikutnya.</p>
        </section>
      )}
    </main>
  );
}
