import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FilePenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rp } from "@/lib/visit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Riwayat Transaksi — Sales Pouch" }, { name: "description", content: "Riwayat nota kunjungan dan jual langsung." }, { property: "og:title", content: "Riwayat Transaksi — Sales Pouch" }, { property: "og:description", content: "Riwayat nota kunjungan dan jual langsung." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["transaction-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id,receipt_number,visit_date,transaction_type,total_sales,discount_amount,remaining_debt,revised_at,outlets(name)")
        .order("visit_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Riwayat Transaksi</h1>
      <div className="mt-5 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!isLoading && !data?.length && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada transaksi.</p>}
        {data?.map((t) => (
          <article key={t.id} className="rounded-md border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{(t.outlets as { name: string } | null)?.name ?? "-"}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{t.receipt_number} · {new Date(t.visit_date).toLocaleDateString("id-ID")}</div>
              </div>
              <span className="shrink-0 text-xs font-medium text-primary">{t.transaction_type === "Direct Sale" ? "Jual Langsung" : "Konsinyasi"}</span>
            </div>
            <div className="mt-3 flex items-end justify-between border-t pt-3">
              <div className="text-sm"><b>{rp(Number(t.total_sales) - Number(t.discount_amount))}</b><div className="text-xs text-muted-foreground">Sisa utang {rp(Number(t.remaining_debt))}{t.revised_at ? " · Direvisi" : ""}</div></div>
              <div className="flex gap-1">
                <Button asChild size="icon" variant="outline" aria-label="Edit transaksi"><Link to="/transactions/$id/edit" params={{ id: t.id }}><FilePenLine className="h-4 w-4" /></Link></Button>
                <Button asChild size="icon" variant="ghost" aria-label="Buka nota"><Link to="/receipt/$id" params={{ id: t.id }}><ChevronRight className="h-4 w-4" /></Link></Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}