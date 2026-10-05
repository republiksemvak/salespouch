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
 * Jika outlet belum pernah punya kunjungan konsinyasi, gunakan stok
 * pembukaan yang dimasukkan Owner sebagai snapshot stok fisik awal.
 *
 * Untuk AKUMULASI, stok yang dibawa ke kunjungan berikutnya adalah
 * sisa rak + konsinyasi baru.
 * Untuk TARIK BERSIH, stok yang dibawa ke kunjungan berikutnya adalah
 * konsinyasi baru dari kunjungan terakhir, karena stok lama harus ditarik
 * habis pada kunjungan berikutnya.
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

  if (!last) {
    const { data: opening, error: openingError } = await (supabase as any)
      .from("outlet_opening_stock")
      .select("product_id,quantity,products:product_id(name,price,pcs_per_pack)")
      .eq("outlet_id", outletId)
      .gt("quantity", 0);

    if (openingError) throw openingError;

    const stock = ((opening ?? []) as Array<{
      product_id: string;
      quantity: number;
      products?: { name?: string; price?: number; pcs_per_pack?: number } | null;
    }>)
      .filter((row) => row.products?.name)
      .map((row) => ({
        name: row.products?.name ?? "",
        price: Number(row.products?.price) || 0,
        qty: Number(row.quantity) || 0,
        pcs_per_pack: Number(row.products?.pcs_per_pack) || 1,
      }));

    return { stock, previousDebt: 0 };
  }

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

  if (last.stock_scheme === "accumulation") {
    for (const item of (last.line_items as LineItem[]) ?? []) {
      add(
        item.name,
        item.price,
        Number(item.remaining) || 0,
        item.pcs_per_pack
      );
    }

    for (const item of (last.new_consignment_items as NewItem[]) ?? []) {
      add(
        item.name,
        item.price,
        Number(item.qty) || 0,
        item.pcs_per_pack
      );
    }
  } else {
    // Tarik Bersih: stok lama ditarik habis pada kunjungan berikutnya.
    // Yang benar-benar menjadi stok awal kunjungan berikutnya adalah
    // konsinyasi BARU yang ditinggalkan pada kunjungan terakhir.
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
