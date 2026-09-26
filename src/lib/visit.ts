import { supabase } from "@/integrations/supabase/client";

export type LineItem = {
  name: string;
  price: number;
  prev_stock: number;
  sold: number;
  returned: number;
  remaining: number;
  subtotal: number;
};
export type NewItem = { name: string; price: number; qty: number };

export const rp = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

/** Stock still sitting at the outlet after the last visit, merged by product name. */
export async function loadLastVisit(outletId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("line_items,new_consignment_items,remaining_debt")
    .eq("outlet_id", outletId)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0];
  if (!last) return null;
  const stock = new Map<string, { name: string; price: number; qty: number }>();
  const add = (name: string, price: number, qty: number) => {
    if (!name || qty <= 0) return;
    const key = name.trim().toLowerCase();
    const cur = stock.get(key);
    stock.set(key, { name: name.trim(), price: price || cur?.price || 0, qty: (cur?.qty ?? 0) + qty });
  };
  for (const li of (last.line_items as LineItem[]) ?? []) add(li.name, li.price, Number(li.remaining) || 0);
  for (const ni of (last.new_consignment_items as NewItem[]) ?? []) add(ni.name, ni.price, Number(ni.qty) || 0);
  return { stock: [...stock.values()], previousDebt: Number(last.remaining_debt) || 0 };
}

export async function nextReceiptNumber(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `SP-${y}${m}${d}-`;
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .like("receipt_number", `${prefix}%`);
  return prefix + String((count ?? 0) + 1).padStart(3, "0");
}
