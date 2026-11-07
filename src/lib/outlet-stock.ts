import { supabase } from "@/integrations/supabase/client";

export type OutletBalance = { outletId: string; productId: string; name: string; price: number; pcs_per_pack: number; quantity: number };

export function calculateLocationStock(
  openings: { location_id: string; product_id: string; quantity: number }[],
  movements: { from_location_id: string | null; to_location_id: string | null; product_id: string; quantity: number }[],
  locationIds: string[],
) {
  const balances = new Map<string, Map<string, number>>();
  for (const id of locationIds) balances.set(id, new Map());
  const add = (id: string | null, product: string, quantity: number) => {
    if (!id) return;
    const stock = balances.get(id);
    if (stock) stock.set(product, (stock.get(product) ?? 0) + quantity);
  };
  for (const row of openings) add(row.location_id, row.product_id, Number(row.quantity));
  for (const row of movements) {
    add(row.to_location_id, row.product_id, Number(row.quantity));
    add(row.from_location_id, row.product_id, -Number(row.quantity));
  }
  return balances;
}

export async function loadOutletBalances(outletId?: string): Promise<OutletBalance[]> {
  let query = supabase.from("stock_locations").select("id,outlet_id").eq("location_type", "outlet");
  if (outletId) query = query.eq("outlet_id", outletId);
  const { data: locations, error } = await query;
  if (error) throw error;
  if (!locations?.length) return [];
  const ids = locations.map((row) => row.id);
  const [opening, movement, catalog] = await Promise.all([
    supabase.from("stock_opening_items").select("location_id,product_id,quantity").in("location_id", ids),
    supabase.from("stock_movements").select("from_location_id,to_location_id,product_id,quantity"),
    supabase.from("sales_catalog").select("id,name,price,pcs_per_pack"),
  ]);
  if (opening.error) throw opening.error;
  if (movement.error) throw movement.error;
  if (catalog.error) throw catalog.error;
  const balances = calculateLocationStock(opening.data ?? [], movement.data ?? [], ids);
  return locations.flatMap((location) => {
    if (!location.outlet_id) return [];
    return (catalog.data ?? []).flatMap((product) => {
      if (!product.id || !product.name) return [];
      const quantity = balances.get(location.id)?.get(product.id) ?? 0;
      return [{ outletId: location.outlet_id as string, productId: product.id, name: product.name,
        price: Number(product.price) || 0, pcs_per_pack: Number(product.pcs_per_pack) || 1, quantity }];
    });
  });
}