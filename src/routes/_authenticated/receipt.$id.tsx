import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bluetooth, FilePenLine, MessageCircle, Printer, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { rp, type LineItem, type NewItem } from "@/lib/visit";
import { formatQty, packSize } from "@/lib/units";
import { shareReceiptPng, type ReceiptLine } from "@/lib/receipt-image";
import { isBluetoothPrintSupported, printReceiptBluetooth } from "@/lib/thermal-print";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/receipt/$id")({
  head: () => ({ meta: [{ title: "Nota — Sales Pouch" }, { name: "description", content: "Nota thermal titipan dan penjualan pack serta pcs." }, { property: "og:title", content: "Nota — Sales Pouch" }, { property: "og:description", content: "Nota thermal titipan dan penjualan pack serta pcs." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReceiptPage,
});

const fmtDate = (d: string) => new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

function ReceiptPage() {
  const { id } = Route.useParams();
  const { data: p } = useProfile();
  const [busy, setBusy] = useState<"share" | "bt" | null>(null);
  const { data: t, isLoading, error } = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*, outlets(name, owner_phone)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: prev } = useQuery({
    queryKey: ["receipt-prev", id],
    enabled: !!t,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("receipt_number,visit_date,line_items,new_consignment_items,amount_paid,remaining_debt")
        .eq("outlet_id", t!.outlet_id).neq("id", id)
        .or(`visit_date.lt.${t!.visit_date},and(visit_date.eq.${t!.visit_date},created_at.lt.${t!.created_at})`)
        .order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">Memuat nota…</p>;
  if (error || !t) return <p className="p-10 text-center text-destructive">Nota tidak ditemukan.</p>;

  const items = (t.line_items as LineItem[]) ?? [];
  const newItems = (t.new_consignment_items as NewItem[]) ?? [];
  const prevDebt = Number(t.previous_debt);
  const discountAmount = Number(t.discount_amount) || 0;
  const business = p?.profile?.business_name ?? "";
  const outlet = t.outlets as { name: string; owner_phone: string | null } | null;
  const store = outlet?.name ?? "-";
  const phone = outlet?.owner_phone ?? "";
  const prevTitip = prev ? ((prev.new_consignment_items as NewItem[]) ?? []) : [];

  function asText() {
    const L: string[] = [business.toUpperCase()];
    if (p?.profile?.business_address) L.push(p.profile.business_address);
    if (p?.profile?.business_phone) L.push(`Telp: ${p.profile.business_phone}`);
    L.push(`No Nota : ${t!.receipt_number}`, `Jenis   : ${t!.transaction_type === "Direct Sale" ? "JUAL LANGSUNG" : "KONSINYASI"}`, `Toko    : ${store}`, `Sales   : ${t!.sales_name}`, `Tanggal : ${fmtDate(t!.visit_date)}`, "--------------------------------");
    if (t!.transaction_type === "Consignment" && prev && prevTitip.length > 0) {
      L.push("TITIPAN SEBELUMNYA");
      prevTitip.forEach((n) => L.push(`  ${n.name}: ${formatQty(n.qty, n.pcs_per_pack)}`));
      L.push("--------------------------------");
    }
    items.forEach((i) => {
      L.push(i.name);
      if (t!.transaction_type === "Consignment") L.push(`  Titip Sebelumnya: ${formatQty(i.prev_stock, i.pcs_per_pack)}`);
      L.push(`  Terjual ${formatQty(i.sold, i.pcs_per_pack)} x ${rp(i.price / packSize(i.pcs_per_pack))}/pcs = ${rp(i.subtotal)}`);
      if (t!.transaction_type === "Consignment") L.push(`  Retur/sisa: ${formatQty(i.returned, i.pcs_per_pack)}`);
    });
    L.push("--------------------------------");
    if (prevDebt > 0) {
      L.push(`Utang Sebelumnya : ${rp(prevDebt)}`, `Total Penjualan  : ${rp(t!.total_sales)}`);
      if (discountAmount > 0) L.push(`Diskon Nota      : -${rp(discountAmount)}`);
      L.push(`Total Tagihan    : ${rp(t!.total_due)}`, `Dibayar          : ${rp(t!.amount_paid)}`, `Sisa Utang       : ${rp(t!.remaining_debt)}`);
    } else {
      if (discountAmount > 0) L.push(`Total Penjualan  : ${rp(t!.total_sales)}`, `Diskon Nota      : -${rp(discountAmount)}`);
      L.push(`TOTAL TAGIHAN / DIBAYAR : ${rp(t!.total_due)} (Status: Lunas / Tanpa Tunggakan) ✅`);
    }
    if (newItems.length) { L.push("--------------------------------", "TITIP BARU HARI INI"); newItems.forEach((n) => L.push(`  ${n.name}: ${formatQty(n.qty, n.pcs_per_pack)} @ ${rp(n.price)}/pack`)); }
    if (t!.custom_note) L.push("", t!.custom_note);
    L.push("", "Terima Kasih 🙏", "*Generated by Sales Pouch*");
    return L.join("\n");
  }

  function sendWa() {
    let num = phone.replace(/\D/g, "");
    if (num.startsWith("0")) num = "62" + num.slice(1);
    else if (num.startsWith("8")) num = "62" + num;
    if (!num) toast.info("Nomor toko belum diisi — pilih kontak di WhatsApp");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(asText())}`, "_blank");
  }

  /** Structured lines for PNG sharing & thermal printing (same content as asText). */
  function asLines(): ReceiptLine[] {
    const L: ReceiptLine[] = [{ text: business.toUpperCase(), bold: true, center: true }];
    if (p?.profile?.business_address) L.push({ text: p.profile.business_address, center: true });
    if (p?.profile?.business_phone) L.push({ text: `Telp: ${p.profile.business_phone}`, center: true });
    L.push(
      { text: `No Nota : ${t!.receipt_number}` },
      { text: `Jenis   : ${t!.transaction_type === "Direct Sale" ? "JUAL LANGSUNG" : "KONSINYASI"}`, bold: true },
      { text: `Toko    : ${store}` },
      { text: `Sales   : ${t!.sales_name}` },
      { text: `Tanggal : ${fmtDate(t!.visit_date)}` },
      { text: "--------------------------------" },
    );
    if (t!.transaction_type === "Consignment" && prev && prevTitip.length > 0) {
      L.push({ text: "TITIPAN SEBELUMNYA", bold: true });
      prevTitip.forEach((n) => L.push({ text: `  ${n.name}: ${formatQty(n.qty, n.pcs_per_pack)}` }));
      L.push({ text: "--------------------------------" });
    }
    items.forEach((i) => {
      L.push({ text: i.name, bold: true });
      if (t!.transaction_type === "Consignment") L.push({ text: `  Titip Sebelumnya: ${formatQty(i.prev_stock, i.pcs_per_pack)}` });
      L.push({ text: `  Terjual ${formatQty(i.sold, i.pcs_per_pack)} x ${rp(i.price / packSize(i.pcs_per_pack))}/pcs = ${rp(i.subtotal)}` });
      if (t!.transaction_type === "Consignment") L.push({ text: `  Retur/sisa: ${formatQty(i.returned, i.pcs_per_pack)}` });
    });
    L.push({ text: "--------------------------------" });
    if (prevDebt > 0) {
      L.push(
        { text: `Utang Sebelumnya : ${rp(prevDebt)}` },
         { text: `Total Penjualan  : ${rp(t!.total_sales)}` },
         ...(discountAmount > 0 ? [{ text: `Diskon Nota      : -${rp(discountAmount)}` }] : []),
         { text: `Total Tagihan    : ${rp(t!.total_due)}`, bold: true },
        { text: `Dibayar          : ${rp(t!.amount_paid)}` },
        { text: `Sisa Utang       : ${rp(t!.remaining_debt)}`, bold: true },
      );
    } else {
      if (discountAmount > 0) L.push({ text: `Total Penjualan  : ${rp(t!.total_sales)}` }, { text: `Diskon Nota      : -${rp(discountAmount)}` });
      L.push({ text: `TOTAL TAGIHAN / DIBAYAR : ${rp(t!.total_due)}`, bold: true }, { text: "Status: Lunas / Tanpa Tunggakan" });
    }
    if (newItems.length) {
      L.push({ text: "--------------------------------" }, { text: "TITIP BARU HARI INI", bold: true });
      newItems.forEach((n) => L.push({ text: `  ${n.name}: ${formatQty(n.qty, n.pcs_per_pack)} @ ${rp(n.price)}/pack` }));
    }
    if (t!.custom_note) L.push({ text: "" }, { text: t!.custom_note });
    L.push({ text: "" }, { text: "Terima Kasih", center: true }, { text: "*Generated by Sales Pouch*", center: true });
    return L;
  }

  async function share() {
    setBusy("share");
    try {
      const how = await shareReceiptPng(asLines(), `${t!.receipt_number}.png`);
      if (how === "downloaded") toast.success("Gambar nota diunduh");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Gagal membagikan gambar nota");
    } finally { setBusy(null); }
  }

  async function printBluetooth() {
    setBusy("bt");
    try {
      await printReceiptBluetooth(asLines());
      toast.success("Nota terkirim ke printer");
    } catch (e) {
      const err = e as Error;
      if (err.name !== "NotFoundError") toast.error(err.message || "Gagal mencetak via Bluetooth");
    } finally { setBusy(null); }
  }

  const hr = <div className="my-2 border-t border-dashed border-foreground/40" />;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Beranda</Link>
      </div>

      <article className="mx-auto mt-4 w-full max-w-[340px] bg-card px-5 py-6 font-mono text-[12px] leading-relaxed text-foreground shadow-lg [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),95%_100%,90%_calc(100%-8px),85%_100%,80%_calc(100%-8px),75%_100%,70%_calc(100%-8px),65%_100%,60%_calc(100%-8px),55%_100%,50%_calc(100%-8px),45%_100%,40%_calc(100%-8px),35%_100%,30%_calc(100%-8px),25%_100%,20%_calc(100%-8px),15%_100%,10%_calc(100%-8px),5%_100%,0_calc(100%-8px))] print:shadow-none">
        <div className="text-center text-sm font-semibold uppercase">{business}</div>
        {p?.profile?.business_address && <div className="text-center text-[11px]">{p.profile.business_address}</div>}
        {p?.profile?.business_phone && <div className="text-center text-[11px]">Telp: {p.profile.business_phone}</div>}
        {hr}
        <Row k="No Nota" v={t.receipt_number} />
        <Row k="Jenis" v={t.transaction_type === "Direct Sale" ? "JUAL LANGSUNG" : "KONSINYASI"} bold />
        <Row k="Toko" v={store} />
        <Row k="Sales" v={t.sales_name} />
        <Row k="Tanggal" v={fmtDate(t.visit_date)} />
        {t.revised_at && <Row k="Status" v="DIREVISI" bold />}
        {hr}
        {t.transaction_type === "Consignment" && prev && prevTitip.length > 0 && (
          <>
            <div className="font-semibold">TITIPAN SEBELUMNYA</div>
            {prevTitip.map((n, i) => <Row key={"t" + i} k={n.name} v={formatQty(n.qty, n.pcs_per_pack)} />)}
            {hr}
            <div className="font-semibold">KUNJUNGAN HARI INI</div>
          </>
        )}
        {items.length === 0 && <div className="text-center text-muted-foreground">— Tidak ada penjualan —</div>}
        {items.map((i, idx) => (
          <div key={idx} className="mb-2">
            <div className="font-semibold">{i.name}</div>
            {t.transaction_type === "Consignment" && <Row k="Titip Sebelumnya" v={formatQty(i.prev_stock, i.pcs_per_pack)} />}
            <Row k={`Terjual ${formatQty(i.sold, i.pcs_per_pack)} × ${rp(i.price / packSize(i.pcs_per_pack))}/pcs`} v={rp(i.subtotal)} />
            {t.transaction_type === "Consignment" && <Row k="Retur/sisa" v={formatQty(i.returned, i.pcs_per_pack)} />}
          </div>
        ))}
        {hr}
        {prevDebt > 0 ? (
          <>
            <Row k="Utang Sebelumnya" v={rp(prevDebt)} />
            <Row k="Total Penjualan" v={rp(Number(t.total_sales))} />
            {discountAmount > 0 && <Row k="Diskon Nota" v={`-${rp(discountAmount)}`} />}
            <Row k="Total Tagihan" v={rp(Number(t.total_due))} bold />
            <Row k="Dibayar" v={rp(Number(t.amount_paid))} />
            <Row k="Sisa Utang" v={rp(Number(t.remaining_debt))} bold />
          </>
        ) : (
          <>
            {discountAmount > 0 && <><Row k="Total Penjualan" v={rp(Number(t.total_sales))} /><Row k="Diskon Nota" v={`-${rp(discountAmount)}`} /></>}
            <div className="font-semibold">TOTAL TAGIHAN / DIBAYAR : {rp(Number(t.total_due))} (Status: Lunas / Tanpa Tunggakan) ✅</div>
          </>
        )}
        {newItems.length > 0 && (
          <>
            {hr}
            <div className="font-semibold">TITIP BARU HARI INI</div>
            {newItems.map((n, idx) => <Row key={idx} k={`${n.name} (${formatQty(n.qty, n.pcs_per_pack)})`} v={`@ ${rp(n.price)}/pack`} />)}
          </>
        )}
        {hr}
        {t.custom_note && <p className="mb-2 whitespace-pre-wrap text-xs text-gray-500">{t.custom_note}</p>}
        <div className="text-center">Terima Kasih 🙏</div>
        <div className="text-center italic">*Generated by Sales Pouch*</div>
      </article>

      <div className="mt-6 grid grid-cols-2 gap-3 print:hidden">
        <Button asChild variant="outline" className="col-span-2 h-12"><Link to="/transactions/$id/edit" params={{ id }}><FilePenLine className="mr-1 h-4 w-4" />Edit Transaksi & Revisi Nota</Link></Button>
        <Button className="col-span-2 h-12" onClick={sendWa}><MessageCircle className="mr-1 h-4 w-4" />Kirim ke WhatsApp Toko</Button>
        {isBluetoothPrintSupported() && (
          <Button className="col-span-2 h-12" variant="secondary" disabled={busy === "bt"} onClick={printBluetooth}>
            <Bluetooth className="mr-1 h-4 w-4" />{busy === "bt" ? "Mencetak…" : "Cetak via Printer Bluetooth"}
          </Button>
        )}
        <Button variant="outline" className="h-12" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Cetak</Button>
        <Button variant="outline" className="h-12" disabled={busy === "share"} onClick={share}>
          <Share2 className="mr-1 h-4 w-4" />{busy === "share" ? "Menyiapkan gambar…" : "Bagikan (PNG)"}
        </Button>
      </div>
    </main>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""}`}><span>{k}</span><span className="text-right">{v}</span></div>;
}
