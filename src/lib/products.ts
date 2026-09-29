import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LineItem, NewItem } from "@/lib/visit";
import { packSize } from "@/lib/units";

export type Product = { id: string; name: string; price: number; price_grosir: number; price_agen: number; cost_price: number; warehouse_stock: number; pcs_per_pack: number };

export type PriceTier = "eceran" | "grosir" | "agen";
export const TIERS: { id: PriceTier; label: string }[] = [
  { id: "eceran", label: "Eceran" }, { id: "grosir", label: "Grosir" }, { id: "agen", label: "Agen" },
];
/** Price for a tier; empty (0) tier prices fall back to the retail price. */
export const tierPrice = (p: Product, t: PriceTier) =>
  (t === "grosir" ? p.price_grosir : t === "agen" ? p.price_agen : 0) || p.price;

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,price,price_grosir,price_agen,cost_price,warehouse_stock,pcs_per_pack").order("name");
      if (error) throw error;
      return data.map((p) => ({ ...p, price: Number(p.price), price_grosir: Number(p.price_grosir), price_agen: Number(p.price_agen), cost_price: Number(p.cost_price), warehouse_stock: Number(p.warehouse_stock), pcs_per_pack: packSize(p.pcs_per_pack) })) as Product[];
    },
  });
}

const key = (n: string) => n.trim().toLowerCase();

/** Per product (by name): stock sitting at stores (latest visit per outlet) and total returned. */
export function useStockSummary() {
  return useQuery({
    queryKey: ["stock-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("outlet_id,line_items,new_consignment_items,visit_date,created_at")
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
      return { atStore, returned };
    },
  });
}

/** Adjust warehouse stock: out = goods leaving the warehouse, back = returns coming in. */
export async function adjustWarehouse(products: Product[], out: { name: string; qty: number }[], back: { name: string; qty: number }[]) {
  const delta = new Map<string, number>();
  for (const o of out) delta.set(key(o.name), (delta.get(key(o.name)) ?? 0) - o.qty);
  for (const b of back) delta.set(key(b.name), (delta.get(key(b.name)) ?? 0) + b.qty);
  await Promise.all(products.filter((p) => delta.get(key(p.name))).map((p) =>
    supabase.from("products").update({ warehouse_stock: p.warehouse_stock + (delta.get(key(p.name)) ?? 0) }).eq("id", p.id),
  ));
}
