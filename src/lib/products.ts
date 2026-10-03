import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LineItem, NewItem } from "@/lib/visit";
import { packSize } from "@/lib/units";
import { useProfile } from "@/hooks/use-profile";
import { getOwnerProducts } from "@/lib/team.functions";
import { useServerFn } from "@tanstack/react-start";

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
        const { data, error } = await supabase.from("sales_catalog").select("id,name,price,price_grosir,price_agen,warehouse_stock,pcs_per_pack").order("name");
        if (error) throw error;
        return data;
      })();
      return data.map((p) => ({ ...p, price: Number(p.price), price_grosir: Number(p.price_grosir), price_agen: Number(p.price_agen), cost_price: "cost_price" in p ? Number(p.cost_price) : 0, warehouse_stock: Number(p.warehouse_stock), pcs_per_pack: packSize(p.pcs_per_pack) })) as Product[];
    },
  });
}

const key = (n: string) => n.trim().toLowerCase();

/** Per product: stock at stores from the latest visit, or opening stock before the first consignment visit. */
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
      const seen = new Set<string>();
      for (const t of data) {
        for (const li of (t.line_items as LineItem[]) ?? [])
          returned.set(key(li.name), (returned.get(key(li.name)) ?? 0) + (Number(li.returned) || 0));
        if (seen.has(t.outlet_id)) continue;
        seen.add(t.outlet_id);
        for (const li of (t.line_items as LineItem[]) ?? [])
          atStore.set(key(li.name), (atStore.get(key(li.name)) ?? 0) + (Number(li.remaining) || 0));
        for (const ni of (t.new_consignment_items as NewItem[]) ?? [])
          atStore.set(key(ni.name), (atStore.get(key(ni.name)) ?? 0) + (Number(ni.qty) || 0));
      }

      const { data: opening, error: openingError } = await (supabase as any)
        .from("outlet_opening_stock")
        .select("outlet_id,product_id,quantity,products:product_id(name)")
        .gt("quantity", 0);
      if (openingError) throw openingError;

      for (const row of (opening ?? []) as Array<{
        outlet_id: string;
        product_id: string;
        quantity: number;
        products?: { name?: string } | null;
      }>) {
        if (seen.has(row.outlet_id) || !row.products?.name) continue;
        const name = key(row.products.name);
        atStore.set(name, (atStore.get(name) ?? 0) + (Number(row.quantity) || 0));
      }

      return { atStore, returned };
    },
  });
}
