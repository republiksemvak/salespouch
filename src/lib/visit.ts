import { supabase } from "@/integrations/supabase/client";

export type LineItem = {
  name: string;
  price: number;
  pcs_per_pack?: number;
  prev_stock: number;
  sold: number;
  returned: number;
  remaining: number;
  subtotal: number;
};

export type NewItem = {
  name: string;
  price: number;
  qty: number;
  pcs_per_pack?: number;
};

export const rp = (n: number) =>
  "Rp " + Math.round(n || 0).toLocaleString("id-ID");

/**
 * Mengambil stok yang masih berada di outlet dari kunjungan terakhir.
 *
 * AKUMULASI:
 * Stok minggu berikutnya =
 * Sisa di rak minggu ini + stok baru yang dititipkan minggu ini.
 *
 * TARIK BERSIH:
 * Tidak membawa stok lama ke minggu berikutnya.
 */
export async function loadLastVisit(outletId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "line_items,new_consignment_items,remaining_debt,stock_scheme"
    )
    .eq("outlet_id", outletId)
    .eq("transaction_type", "Consignment")
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const last = data?.[0];

  if (!last) return null;

  const stock = new Map<
    string,
    {
      name: string;
      price: number;
      qty: number;
      pcs_per_pack: number;
    }
  >();

  const add = (
    name: string,
    price: number,
    qty: number,
    pcs_per_pack = 1
  ) => {
    if (!name || qty <= 0) return;

    const key = name.trim().toLowerCase();
    const current = stock.get(key);

    stock.set(key, {
      name: name.trim(),
      price: price || current?.price || 0,
      qty: (current?.qty ?? 0) + qty,
      pcs_per_pack,
    });
  };

  /**
   * Hanya AKUMULASI yang membawa stok outlet
   * ke kunjungan berikutnya.
   */
  if (last.stock_scheme === "accumulation") {
    // Sisa stok yang masih berada di rak toko.
    for (const item of (last.line_items as LineItem[]) ?? []) {
      add(
        item.name,
        item.price,
        Number(item.remaining) || 0,
        item.pcs_per_pack
      );
    }

    // Stok baru yang dibawa sales pada kunjungan sebelumnya.
    for (const item of (last.new_consignment_items as NewItem[]) ?? []) {
      add(
        item.name,
        item.price,
        Number(item.qty) || 0,
        item.pcs_per_pack
      );
    }
  }

  return {
    stock: [...stock.values()],
    previousDebt: Number(last.remaining_debt) || 0,
  };
}

export async function nextReceiptNumber(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  const prefix = `SP-${y}${m}${d}-`;

  const { count } = await supabase
    .from("transactions")
    .select("id", {
      count: "exact",
      head: true,
    })
    .like("receipt_number", `${prefix}%`);

  return prefix + String((count ?? 0) + 1).padStart(3, "0");
}
