import { supabase } from "@/integrations/supabase/client";
import { loadOutletBalances } from "@/lib/outlet-stock";

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

type VisitRow = {
  line_items: LineItem[] | null;
  new_consignment_items: NewItem[] | null;
  remaining_debt: number;
  stock_scheme: "accumulation" | "clean_pull";
  transaction_type: "Consignment" | "Direct Sale";
};

/**
 * Mengambil stok fisik yang menjadi dasar kunjungan berikutnya.
 *
 * Blueprint Sales Pouch memperlakukan kunjungan tanpa titipan baru sebagai
 * kunjungan administratif/debt-only bila tidak ada perubahan fisik baru.
 * Karena itu, bila kunjungan konsinyasi terakhir tidak mempunyai titipan
 * aktif, kita telusuri mundur sampai menemukan kunjungan terakhir yang masih
 * mempunyai titipan aktif.
 */
export async function loadLastVisit(outletId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "line_items,new_consignment_items,remaining_debt,stock_scheme,transaction_type"
    )
    .eq("outlet_id", outletId)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const visits = (data ?? []) as VisitRow[];

  const stockFromVisit = (visit: VisitRow) => {
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

    if (visit.stock_scheme === "accumulation") {
      for (const item of visit.line_items ?? []) {
        add(
          item.name,
          item.price,
          Number(item.remaining) || 0,
          item.pcs_per_pack
        );
      }
    }

    for (const item of visit.new_consignment_items ?? []) {
      add(
        item.name,
        item.price,
        Number(item.qty) || 0,
        item.pcs_per_pack
      );
    }

    return [...stock.values()];
  };

  // First try the latest visit. If it is a debt-only visit / has no active
  // physical consignment, walk backwards to the latest visit that does.
  let selected: VisitRow | null = null;
  let selectedStock: ReturnType<typeof stockFromVisit> = [];

  for (const visit of visits) {
    if (visit.transaction_type !== "Consignment") continue;
    const stock = stockFromVisit(visit);
    if (stock.length > 0) {
      selected = visit;
      selectedStock = stock;
      break;
    }
  }

  if (!selected) {
    const stock = (await loadOutletBalances(outletId))
      .filter((row) => row.quantity > 0)
      .map((row) => ({
        name: row.name,
        price: row.price,
        qty: Number(row.quantity) || 0,
        pcs_per_pack: row.pcs_per_pack,
      }));

    return { stock, previousDebt: visits[0] ? Number(visits[0].remaining_debt) || 0 : 0 };
  }

  return {
    stock: selectedStock,
    previousDebt: Number(visits[0]?.remaining_debt) || 0,
  };
}

export async function nextReceiptNumber(date = new Date()) {
  const receiptDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const { data, error } = await (supabase as any).rpc(
    "next_receipt_number",
    { _receipt_date: receiptDate }
  );

  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Nomor nota gagal dibuat.");
  }

  return data;
}
