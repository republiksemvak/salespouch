import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FilePenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { rp } from "@/lib/visit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/transactions/")({
  head: () => ({
    meta: [
      { title: "Riwayat Transaksi — Sales Pouch" },
      { name: "description", content: "Riwayat nota kunjungan dan jual langsung." },
      { property: "og:title", content: "Riwayat Transaksi — Sales Pouch" },
      { property: "og:description", content: "Riwayat nota kunjungan dan jual langsung." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }
    ]
  }),
  component: TransactionsPage,
});

type TransactionItem = {
  id: string;
  receipt_number: string;
  visit_date: string;
  transaction_type: "Consignment" | "Direct Sale";
  total_sales: number;
  discount_amount: number;
  remaining_debt: number;
  revised_at?: string | null;
  outlet_name: string;
  source: "field" | "warehouse";
  sales_name?: string | null;
};

function TransactionsPage() {
  const { data: account, isLoading: profileLoading } = useProfile();
  const isOwnerOrAdmin = account?.role === "owner" || account?.role === "admin" || account?.role === "manager";

  const { data, isLoading } = useQuery({
    queryKey: ["transaction-history", account?.userId, account?.ownerId, account?.role],
    enabled: !!account?.userId,
    queryFn: async () => {
      let fieldQuery = supabase
        .from("transactions")
        .select("id,receipt_number,visit_date,transaction_type,total_sales,discount_amount,remaining_debt,revised_at,sales_name,sales_user_id,outlets(name)")
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (!isOwnerOrAdmin) {
        fieldQuery = fieldQuery.eq("sales_user_id", account!.userId);
      } else {
        fieldQuery = fieldQuery.eq("user_id", account!.ownerId);
      }

      const { data: fieldData, error: fieldError } = await fieldQuery;
      if (fieldError) throw fieldError;

      const items: TransactionItem[] = (fieldData || []).map((t: any) => ({
        id: t.id,
        receipt_number: t.receipt_number,
        visit_date: t.visit_date,
        transaction_type: t.transaction_type,
        total_sales: Number(t.total_sales) || 0,
        discount_amount: Number(t.discount_amount) || 0,
        remaining_debt: Number(t.remaining_debt) || 0,
        revised_at: t.revised_at,
        outlet_name: (t.outlets as { name: string } | null)?.name ?? "-",
        source: "field",
        sales_name: t.sales_name
      }));

      if (isOwnerOrAdmin) {
        const { data: warehouseData, error: warehouseError } = await supabase
          .from("warehouse_direct_sales")
          .select("id,receipt_number,sale_date,total_sales,discount_amount,amount_paid,buyer_name,outlets:buyer_outlet_id(name)")
          .eq("owner_id", account!.ownerId)
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (!warehouseError && warehouseData) {
          warehouseData.forEach((w: any) => {
            const net = Math.max(0, (Number(w.total_sales) || 0) - (Number(w.discount_amount) || 0));
            const debt = Math.max(0, net - (Number(w.amount_paid) || 0));
            items.push({
              id: w.id,
              receipt_number: w.receipt_number,
              visit_date: w.sale_date,
              transaction_type: "Direct Sale",
              total_sales: Number(w.total_sales) || 0,
              discount_amount: Number(w.discount_amount) || 0,
              remaining_debt: debt,
              revised_at: null,
              outlet_name: w.outlets?.name || w.buyer_name || "Direct Gudang",
              source: "warehouse",
              sales_name: "Gudang Utama"
            });
          });
        }
      }

      return items.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />Kembali
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Riwayat Transaksi</h1>
        {!isOwnerOrAdmin && account && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
            Nota Saya
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {(isLoading || profileLoading) && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!isLoading && !data?.length && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada transaksi.
          </p>
        )}
        {data?.map((t) => (
          <article key={t.id} className="rounded-md border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{t.outlet_name}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {t.receipt_number} · {new Date(t.visit_date).toLocaleDateString("id-ID")}
                  {isOwnerOrAdmin && t.sales_name ? ` · ${t.sales_name}` : ""}
                </div>
              </div>
              <span className={`shrink-0 text-xs font-medium ${t.source === "warehouse" ? "text-amber-600" : "text-primary"}`}>
                {t.source === "warehouse" ? "Direct Gudang" : t.transaction_type === "Direct Sale" ? "Jual Langsung" : "Konsinyasi"}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between border-t pt-3">
              <div className="text-sm">
                <b>{rp(Number(t.total_sales) - Number(t.discount_amount))}</b>
                <div className="text-xs text-muted-foreground">
                  Sisa utang {rp(Number(t.remaining_debt))}
                  {t.revised_at ? " · Direvisi" : ""}
                </div>
              </div>
              <div className="flex gap-1">
                {t.source === "field" && isOwnerOrAdmin && (
                  <Button asChild size="icon" variant="outline" aria-label="Edit transaksi">
                    <Link to="/transactions/$id/edit" params={{ id: t.id }}><FilePenLine className="h-4 w-4" /></Link>
                  </Button>
                )}
                <Button asChild size="icon" variant="ghost" aria-label="Buka nota">
                  <Link to="/receipt/$id" params={{ id: t.id }}><ChevronRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
