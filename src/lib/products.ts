import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LineItem, NewItem } from "@/lib/visit";
import { packSize } from "@/lib/units";
import { useProfile } from "@/hooks/use-profile";
import { getOwnerProducts } from "@/lib/team.functions";
import { useServerFn } from "@tanstack/react-start";
import { loadOutletBalances } from "@/lib/outlet-stock";

export type Product = { id: string; name: string; price: number; price_grosir: number; price_agen: number; cost_price: number; warehouse_stock: number; pcs_per_pack: number };

export type PriceTier = "eceran" | "grosir" | "agen";
export const TIERS: { id: PriceTier; label: string }[] = [
  { id: "eceran", label: "Eceran" }, { id: "grosir", label: "Grosir" }, { id: "agen", label: "Agen" },
];
/** Price for a tier; empty (0) tier prices fall back to the retail price. */
export const tierPrice = (p: Product, t: PriceTier) =>
  (t === "grosir" ? p.price_grosir : t === "agen" ? p.price_agen : 0) || p.price;

export function useProducts() {
  const { data: account } = useProfile();
  const fetchOwner = useServerFn(getOwnerProducts);
  return useQuery({
    queryKey: ["products", account?.ownerId, account?.role],
    enabled: !!account,
    staleTime: 60_000,
    queryFn: async () => {
      const data = account?.role === "owner" ? await fetchOwner() : await (async () => {
        const { data, error } = await supabase.from("sales_catalog").select("id,name,price,price_grosir,price_agen,pcs_per_pack").order("name");
        if (error) throw error;
        return data;
      })();

      const { data: warehouseBalances, error: warehouseError } = await (supabase as any)
        .from("warehouse_stock_ledger")
        .select("product_id,warehouse_stock");
      if (warehouseError) throw warehouseError;
      const warehouseMap = new Map((warehouseBalances ?? []).map((row: { product_id: string; warehouse_stock: number }) => [row.product_id, Number(row.warehouse_stock) || 0]));

      return data.map((p) => ({
        ...p,
        price: Number(p.price),
        price_grosir: Number(p.price_grosir),
        price_agen: Number(p.price_agen),
        cost_price: "cost_price" in p ? Number(p.cost_price) : 0,
        warehouse_stock: warehouseMap.get(p.id) ?? 0,
        pcs_per_pack: packSize(p.pcs_per_pack),
      })) as Product[];
    },
  });
}

const key = (n: string) => n.trim().toLowerCase();

/** Physical stock comes from the same location ledger as Master Stok. */
export function useStockSummary() {
  return useQuery({
    queryKey: ["stock-summary"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("outlet_id,line_items,new_consignment_items,visit_date,created_at,transaction_type")
        .eq("transaction_type", "Consignment")
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const atStore = new Map<string, number>();
      const returned = new Map<string, number>();
      for (const t of data) {
        for (const li of (t.line_items as LineItem[]) ?? [])
          returned.set(key(li.name), (returned.get(key(li.name)) ?? 0) + (Number(li.returned) || 0));
      }

      for (const row of await loadOutletBalances()) {
        const name = key(row.name);
        atStore.set(name, (atStore.get(name) ?? 0) + row.quantity);
      }

      return { atStore, returned };
    },
  });
}
