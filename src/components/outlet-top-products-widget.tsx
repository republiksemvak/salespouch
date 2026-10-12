import { Flame, Plus } from "lucide-react";
import { useOutletTopProducts } from "@/hooks/use-outlet-top-products";

export function OutletTopProductsWidget({
  ownerId,
  outletId,
  onQuickAdd,
}: {
  ownerId?: string;
  outletId: string;
  onQuickAdd?: (productName: string) => void;
}) {
  const { data: topProducts = [], isLoading } = useOutletTopProducts({
    ownerId,
    outletId,
    days: 90,
    limit: 5,
    enabled: !!outletId,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground animate-pulse">
        Memeriksa riwayat produk favorit toko ini…
      </div>
    );
  }

  if (topProducts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Flame className="h-4 w-4 fill-amber-500 text-amber-500" />
          <span>Produk Terlaris di Toko Ini (90 Hari Terakhir)</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">Rekomendasi Restock</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {topProducts.map((p, idx) => (
          <div
            key={p.product_name}
            className="flex items-center gap-1.5 rounded-lg border border-amber-200/60 bg-background px-2.5 py-1 text-xs shadow-2xs dark:border-amber-900/40"
          >
            <span className="font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
              #{idx + 1}
            </span>
            <span className="font-medium">{p.product_name}</span>
            <span className="text-[10px] text-muted-foreground">({p.total_qty} pcs)</span>
            {onQuickAdd && (
              <button
                type="button"
                onClick={() => onQuickAdd(p.product_name)}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 active:scale-95 dark:text-amber-300"
                title={`Tambah ${p.product_name} ke titipan baru`}
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
