import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Product = { id: string; name: string; price: number };

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,price").order("name");
      if (error) throw error;
      return data.map((p) => ({ ...p, price: Number(p.price) })) as Product[];
    },
  });
}

/** Save any product names not yet in the catalogue (keeps existing prices). */
export async function rememberProducts(items: { name: string; price: number }[], known: Product[]) {
  const have = new Set(known.map((p) => p.name.trim().toLowerCase()));
  const fresh = new Map<string, { name: string; price: number }>();
  for (const i of items) {
    const n = i.name.trim();
    if (n && !have.has(n.toLowerCase())) fresh.set(n.toLowerCase(), { name: n, price: i.price || 0 });
  }
  if (fresh.size) await supabase.from("products").upsert([...fresh.values()], { onConflict: "user_id,name", ignoreDuplicates: true });
}
