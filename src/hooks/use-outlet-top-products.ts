import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OutletTopProduct = {
  outlet_id: string;
  outlet_name: string;
  product_name: string;
  total_qty: number;
  total_sales: number;
  transaction_count: number;
  last_sold_at: string;
};

export function useOutletTopProducts({
  ownerId,
  outletId,
  days = 90,
  limit = 5,
  enabled = true,
}: {
  ownerId?: string;
  outletId?: string | null;
  days?: number;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery<OutletTopProduct[]>({
    queryKey: ["outlet-top-products", ownerId, outletId ?? "all", days, limit],
    enabled: !!ownerId && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_outlet_top_products", {
        _owner_id: ownerId!,
        _outlet_id: outletId || null,
        _days: days,
        _limit: limit,
      });

      if (error) {
        console.error("Gagal memanggil get_outlet_top_products:", error);
        throw error;
      }
      return (data ?? []) as OutletTopProduct[];
    },
    staleTime: 60_000 * 5,
  });
}
