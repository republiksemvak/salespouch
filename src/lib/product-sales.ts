import { packSize } from "@/lib/units";

export type ProductSalesRow = {
  name: string;
  qty: number;
  omset: number;
};

type ProductLineItem = {
  name?: string;
  sold?: number;
  price?: number;
  subtotal?: number;
  pcs_per_pack?: number;
};

type TransactionForProductSales = {
  line_items: unknown;
  total_sales?: number | null;
  discount_amount?: number | null;
};

const key = (name: string) => name.trim().toLowerCase();

/**
 * Shared product-sales calculation.
 * Invoice discount is allocated to each product proportionally to its gross line subtotal.
 * This is the same formula used by Laporan Keuangan for per-product net sales.
 */
export function aggregateProductSales(transactions: TransactionForProductSales[]): ProductSalesRow[] {
  const map = new Map<string, ProductSalesRow>();

  for (const tx of transactions) {
    const gross = Number(tx.total_sales) || 0;
    const discount = Number(tx.discount_amount) || 0;
    const netFactor = gross ? (gross - discount) / gross : 0;

    for (const raw of (tx.line_items as ProductLineItem[] | null) ?? []) {
      const name = String(raw.name ?? "").trim();
      const qty = Number(raw.sold) || 0;
      if (!name || qty <= 0) continue;

      const grossLine = Number(raw.subtotal) || Math.round(qty * (Number(raw.price) || 0) / packSize(raw.pcs_per_pack));
      const netLine = grossLine * netFactor;
      const k = key(name);
      const current = map.get(k) ?? { name, qty: 0, omset: 0 };
      current.qty += qty;
      current.omset += netLine;
      map.set(k, current);
    }
  }

  return [...map.values()];
}
