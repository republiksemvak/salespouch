import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bluetooth,
  FilePenLine,
  MessageCircle,
  Printer,
  Share2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { rp, type LineItem, type NewItem } from "@/lib/visit";
import { formatQty, packSize } from "@/lib/units";
import { shareReceiptPng, type ReceiptLine } from "@/lib/receipt-image";
import {
  isBluetoothPrintSupported,
  printReceiptBluetooth,
} from "@/lib/thermal-print";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/receipt/$id")({
  head: () => ({
    meta: [
      { title: "Nota — Sales Pouch" },
      {
        name: "description",
        content: "Nota thermal titipan dan penjualan pack serta pcs.",
      },
      { property: "og:title", content: "Nota — Sales Pouch" },
      {
        property: "og:description",
        content: "Nota thermal titipan dan penjualan pack serta pcs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceiptPage,
});

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

type NextStock = {
  name: string;
  qty: number;
  price: number;
  pcs_per_pack: number;
};

function ReceiptPage() {
  const { id } = Route.useParams();
  const { data: p } = useProfile();
  const [busy, setBusy] = useState<"share" | "bt" | null>(null);

  const { data: t, isLoading, error } = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .select("*, outlets(name, owner_phone)")
        .eq("id", id)
        .maybeSingle();

      if (tx) return tx;

      const { data: wds, error: wdsError } = await supabase
        .from("warehouse_direct_sales")
        .select("*, outlets:buyer_outlet_id(name, owner_phone)")
        .eq("id", id)
        .maybeSingle();

      if (wds) {
        return {
          id: wds.id,
          receipt_number: wds.receipt_number,
          transaction_type: "Direct Sale",
          stock_scheme: "accumulation",
          visit_date: wds.sale_date,
          created_at: wds.created_at,
          sales_name: "Gudang Utama",
          total_sales: wds.total_sales,
          discount_amount: wds.discount_amount,
          previous_debt: 0,
          total_due: Number(wds.total_sales) - Number(wds.discount_amount),
          amount_paid: wds.amount_paid,
          remaining_debt: Math.max(0, Number(wds.total_sales) - Number(wds.discount_amount) - Number(wds.amount_paid)),
          line_items: wds.line_items,
          new_consignment_items: [],
          custom_note: wds.custom_note,
          outlets: wds.outlets ?? { name: wds.buyer_name, owner_phone: null },
        };
      }

      if (txError) throw txError;
      if (wdsError) throw wdsError;
      return null;
    },
  });

  if (isLoading) {
    return (
      <p className="p-10 text-center text-muted-foreground">
        Memuat nota…
      </p>
    );
  }

  if (error || !t) {
    return (
      <p className="p-10 text-center text-destructive">
        Nota tidak ditemukan.
      </p>
    );
  }

  const receipt = t;

  const items = (receipt.line_items as LineItem[]) ?? [];
  const newItems = (receipt.new_consignment_items as NewItem[]) ?? [];

  const prevDebt = Number(receipt.previous_debt);
  const discountAmount = Number(receipt.discount_amount) || 0;

  const business = p?.profile?.business_name ?? "";

  const outlet = receipt.outlets as {
    name: string;
    owner_phone: string | null;
  } | null;

  const store = outlet?.name ?? "-";
  const phone = outlet?.owner_phone ?? "";

  /*
   * STOK UNTUK NOTA BERIKUTNYA
   *
   * Hanya berlaku untuk skema AKUMULASI.
   *
   * Rumus:
   * Sisa di rak hari ini + Titip baru hari ini
   *
   * Retur fisik tidak masuk karena retur kembali ke gudang.
   *
   * Contoh:
   * Sisa rak 5 + titip baru 15 = stok nota berikutnya 20.
   */
  const nextStock: NextStock[] = [];

  if (
    receipt.transaction_type === "Consignment" &&
    receipt.stock_scheme === "accumulation"
  ) {
    const stockMap = new Map<string, NextStock>();

    const addNextStock = (
      name: string,
      qty: number,
      price: number,
      pcs_per_pack = 1
    ) => {
      if (!name || qty <= 0) return;

      const cleanName = name.trim();
      const key = cleanName.toLowerCase();

      const existing = stockMap.get(key);

      if (existing) {
        existing.qty += qty;

        if (!existing.price && price) {
          existing.price = price;
        }

        if (!existing.pcs_per_pack) {
          existing.pcs_per_pack = pcs_per_pack;
        }
      } else {
        stockMap.set(key, {
          name: cleanName,
          qty,
          price: price || 0,
          pcs_per_pack: pcs_per_pack || 1,
        });
      }
    };

    // Sisa stok yang masih berada di rak.
    items.forEach((i) => {
      addNextStock(
        i.name,
        Number(i.remaining) || 0,
        Number(i.price) || 0,
        packSize(i.pcs_per_pack)
      );
    });

    // Tambahkan titip baru hari ini.
    newItems.forEach((n) => {
      addNextStock(
        n.name,
        Number(n.qty) || 0,
        Number(n.price) || 0,
        packSize(n.pcs_per_pack)
      );
    });

    nextStock.push(...stockMap.values());
  }

  function asText() {
    const L: string[] = [business.toUpperCase()];

    if (p?.profile?.business_address) {
      L.push(p.profile.business_address);
    }

    if (p?.profile?.business_phone) {
      L.push(`Telp: ${p.profile.business_phone}`);
    }

    L.push(
      `No Nota : ${receipt.receipt_number}`,
      `Jenis   : ${
        receipt.transaction_type === "Direct Sale"
          ? "JUAL LANGSUNG"
          : "KONSINYASI"
      }`
    );

    if (receipt.transaction_type === "Consignment") {
      L.push(
        `Skema   : ${
          receipt.stock_scheme === "accumulation"
            ? "AKUMULASI"
            : "TARIK BERSIH"
        }`
      );
    }

    L.push(
      `Toko    : ${store}`,
      `Sales   : ${receipt.sales_name}`,
      `Tanggal : ${fmtDate(receipt.visit_date)}`,
      "--------------------------------",
      "KUNJUNGAN HARI INI"
    );

    items.forEach((i) => {
      L.push(i.name);

      if (receipt.transaction_type === "Consignment") {
        L.push(
          `  Titip Sebelumnya: ${formatQty(
            i.prev_stock,
            i.pcs_per_pack
          )}`
        );
      }

      L.push(
        `  Terjual ${formatQty(
          i.sold,
          i.pcs_per_pack
        )} x ${rp(
          i.price / packSize(i.pcs_per_pack)
        )}/pcs = ${rp(i.subtotal)}`
      );

      if (
        receipt.transaction_type === "Consignment" &&
        receipt.stock_scheme === "accumulation"
      ) {
        L.push(
          `  Sisa di rak: ${formatQty(
            i.remaining,
            i.pcs_per_pack
          )}`
        );
      }

      if (receipt.transaction_type === "Consignment") {
        L.push(
          `  Retur fisik: ${formatQty(
            i.returned,
            i.pcs_per_pack
          )}`
        );
      }
    });

    L.push("--------------------------------");

    if (prevDebt > 0) {
      L.push(
        `Utang Sebelumnya : ${rp(prevDebt)}`,
        `Total Penjualan  : ${rp(receipt.total_sales)}`
      );

      if (discountAmount > 0) {
        L.push(`Diskon Nota      : -${rp(discountAmount)}`);
      }

      L.push(
        `Total Tagihan    : ${rp(receipt.total_due)}`,
        `Dibayar          : ${rp(receipt.amount_paid)}`,
        `Sisa Utang       : ${rp(receipt.remaining_debt)}`
      );
    } else {
      if (discountAmount > 0) {
        L.push(
          `Total Penjualan  : ${rp(receipt.total_sales)}`,
          `Diskon Nota      : -${rp(discountAmount)}`
        );
      }

      L.push(
        `TOTAL TAGIHAN / DIBAYAR : ${rp(
          receipt.total_due
        )} (Status: Lunas / Tanpa Tunggakan) ✅`
      );
    }

    if (newItems.length) {
      L.push(
        "--------------------------------",
        "TITIP BARU HARI INI"
      );

      newItems.forEach((n) => {
        L.push(
          `  ${n.name}: ${formatQty(
            n.qty,
            n.pcs_per_pack
          )} @ ${rp(n.price)}/pack`
        );
      });
    }

    /*
     * STOK UNTUK NOTA BERIKUTNYA
     */
    if (nextStock.length > 0) {
      L.push(
        "--------------------------------",
        "STOK UNTUK NOTA BERIKUTNYA"
      );

      nextStock.forEach((n) => {
        L.push(
          `  ${n.name}: ${formatQty(
            n.qty,
            n.pcs_per_pack
          )}`
        );
      });
    }

    if (receipt.custom_note) {
      L.push("", receipt.custom_note);
    }

    L.push(
      "",
      "Terima Kasih 🙏",
      "*Generated by Sales Pouch*"
    );

    return L.join("\n");
  }

  function sendWa() {
    let num = phone.replace(/\D/g, "");

    if (num.startsWith("0")) {
      num = "62" + num.slice(1);
    } else if (num.startsWith("8")) {
      num = "62" + num;
    }

    if (!num) {
      toast.info(
        "Nomor toko belum diisi — pilih kontak di WhatsApp"
      );
    }

    window.open(
      `https://wa.me/${num}?text=${encodeURIComponent(
        asText()
      )}`,
      "_blank"
    );
  }

  function asLines(): ReceiptLine[] {
    const L: ReceiptLine[] = [
      {
        text: business.toUpperCase(),
        bold: true,
        center: true,
      },
    ];

    if (p?.profile?.business_address) {
      L.push({
        text: p.profile.business_address,
        center: true,
      });
    }

    if (p?.profile?.business_phone) {
      L.push({
        text: `Telp: ${p.profile.business_phone}`,
        center: true,
      });
    }

    L.push(
      {
        text: `No Nota : ${receipt.receipt_number}`,
      },
      {
        text: `Jenis   : ${
          receipt.transaction_type === "Direct Sale"
            ? "JUAL LANGSUNG"
            : "KONSINYASI"
        }`,
        bold: true,
      },
      ...(receipt.transaction_type === "Consignment"
        ? [
            {
              text: `Skema   : ${
                receipt.stock_scheme === "accumulation"
                  ? "AKUMULASI"
                  : "TARIK BERSIH"
              }`,
              bold: true,
            },
          ]
        : []),
      { text: `Toko    : ${store}` },
      { text: `Sales   : ${receipt.sales_name}` },
      { text: `Tanggal : ${fmtDate(receipt.visit_date)}` },
      { text: "--------------------------------" },
      {
        text: "KUNJUNGAN HARI INI",
        bold: true,
      }
    );

    items.forEach((i) => {
      L.push({
        text: i.name,
        bold: true,
      });

      if (receipt.transaction_type === "Consignment") {
        L.push({
          text: `  Titip Sebelumnya: ${formatQty(
            i.prev_stock,
            i.pcs_per_pack
          )}`,
        });
      }

      L.push({
        text: `  Terjual ${formatQty(
          i.sold,
          i.pcs_per_pack
        )} x ${rp(
          i.price / packSize(i.pcs_per_pack)
        )}/pcs = ${rp(i.subtotal)}`,
      });

      if (
        receipt.transaction_type === "Consignment" &&
        receipt.stock_scheme === "accumulation"
      ) {
        L.push({
          text: `  Sisa di rak: ${formatQty(
            i.remaining,
            i.pcs_per_pack
          )}`,
        });
      }

      if (receipt.transaction_type === "Consignment") {
        L.push({
          text: `  Retur fisik: ${formatQty(
            i.returned,
            i.pcs_per_pack
          )}`,
        });
      }
    });

    L.push({
      text: "--------------------------------",
    });

    if (prevDebt > 0) {
      L.push(
        {
          text: `Utang Sebelumnya : ${rp(prevDebt)}`,
        },
        {
          text: `Total Penjualan  : ${rp(
            Number(receipt.total_sales)
          )}`,
        },
        ...(discountAmount > 0
          ? [
              {
                text: `Diskon Nota      : -${rp(
                  discountAmount
                )}`,
              },
            ]
          : []),
        {
          text: `Total Tagihan    : ${rp(
            Number(receipt.total_due)
          )}`,
          bold: true,
        },
        {
          text: `Dibayar          : ${rp(
            Number(receipt.amount_paid)
          )}`,
        },
        {
          text: `Sisa Utang       : ${rp(
            Number(receipt.remaining_debt)
          )}`,
          bold: true,
        }
      );
    } else {
      if (discountAmount > 0) {
        L.push(
          {
            text: `Total Penjualan  : ${rp(
              Number(receipt.total_sales)
            )}`,
          },
          {
            text: `Diskon Nota      : -${rp(
              discountAmount
            )}`,
          }
        );
      }

      L.push(
        {
          text: `TOTAL TAGIHAN / DIBAYAR : ${rp(
            Number(receipt.total_due)
          )}`,
          bold: true,
        },
        {
          text: "Status: Lunas / Tanpa Tunggakan",
        }
      );
    }

    if (newItems.length) {
      L.push(
        {
          text: "--------------------------------",
        },
        {
          text: "TITIP BARU HARI INI",
          bold: true,
        }
      );

      newItems.forEach((n) => {
        L.push({
          text: `  ${n.name}: ${formatQty(
            n.qty,
            n.pcs_per_pack
          )} @ ${rp(n.price)}/pack`,
        });
      });
    }

    /*
     * STOK UNTUK NOTA BERIKUTNYA
     */
    if (nextStock.length > 0) {
      L.push(
        {
          text: "--------------------------------",
        },
        {
          text: "STOK UNTUK NOTA BERIKUTNYA",
          bold: true,
        }
      );

      nextStock.forEach((n) => {
        L.push({
          text: `  ${n.name}: ${formatQty(
            n.qty,
            n.pcs_per_pack
          )}`,
        });
      });
    }

    if (receipt.custom_note) {
      L.push(
        { text: "" },
        { text: receipt.custom_note }
      );
    }

    L.push(
      { text: "" },
      {
        text: "Terima Kasih",
        center: true,
      },
      {
        text: "*Generated by Sales Pouch*",
        center: true,
      }
    );

    return L;
  }

  async function share() {
    setBusy("share");

    try {
      const how = await shareReceiptPng(
        asLines(),
        `${receipt.receipt_number}.png`
      );

      if (how === "downloaded") {
        toast.success("Gambar nota diunduh");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error("Gagal membagikan gambar nota");
      }
    } finally {
      setBusy(null);
    }
  }

  async function printBluetooth() {
    setBusy("bt");

    try {
      await printReceiptBluetooth(asLines());
      toast.success("Nota terkirim ke printer");
    } catch (e) {
      const err = e as Error;

      if (err.name !== "NotFoundError") {
        toast.error(
          err.message || "Gagal mencetak via Bluetooth"
        );
      }
    } finally {
      setBusy(null);
    }
  }

  const hr = (
    <div className="my-2 border-t border-dashed border-foreground/40" />
  );

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Beranda
        </Link>
      </div>

      <article className="mx-auto mt-4 w-full max-w-[340px] bg-card px-5 py-6 font-mono text-[12px] leading-relaxed text-foreground shadow-lg [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),95%_100%,90%_calc(100%-8px),85%_100%,80%_calc(100%-8px),75%_100%,70%_calc(100%-8px),65%_100%,60%_calc(100%-8px),55%_100%,50%_calc(100%-8px),45%_100%,40%_calc(100%-8px),35%_100%,30%_calc(100%-8px),25%_100%,20%_calc(100%-8px),15%_100%,10%_calc(100%-8px),5%_100%,0_calc(100%-8px))] print:shadow-none">
        <div className="text-center text-sm font-semibold uppercase">
          {business}
        </div>

        {p?.profile?.business_address && (
          <div className="text-center text-[11px]">
            {p.profile.business_address}
          </div>
        )}

        {p?.profile?.business_phone && (
          <div className="text-center text-[11px]">
            Telp: {p.profile.business_phone}
          </div>
        )}

        {hr}

        <Row k="No Nota" v={receipt.receipt_number} />

        <Row
          k="Jenis"
          v={
            receipt.transaction_type === "Direct Sale"
              ? "JUAL LANGSUNG"
              : "KONSINYASI"
          }
          bold
        />

        {receipt.transaction_type === "Consignment" && (
          <Row
            k="Skema"
            v={
              receipt.stock_scheme === "accumulation"
                ? "AKUMULASI"
                : "TARIK BERSIH"
            }
            bold
          />
        )}

        <Row k="Toko" v={store} />
        <Row k="Sales" v={receipt.sales_name} />
        <Row k="Tanggal" v={fmtDate(receipt.visit_date)} />

        {receipt.revised_at && (
          <Row
            k="Status"
            v="DIREVISI"
            bold
          />
        )}

        {hr}

        <div className="mb-2 font-semibold">
          KUNJUNGAN HARI INI
        </div>

        {items.length === 0 && (
          <div className="text-center text-muted-foreground">
            — Tidak ada penjualan —
          </div>
        )}

        {items.map((i, idx) => (
          <div key={idx} className="mb-2">
            <div className="font-semibold">
              {i.name}
            </div>

            {receipt.transaction_type === "Consignment" && (
              <Row
                k="Titip Sebelumnya"
                v={formatQty(
                  i.prev_stock,
                  i.pcs_per_pack
                )}
              />
            )}

            <Row
              k={`Terjual ${formatQty(
                i.sold,
                i.pcs_per_pack
              )} × ${rp(
                i.price /
                  packSize(i.pcs_per_pack)
              )}/pcs`}
              v={rp(i.subtotal)}
            />

            {receipt.transaction_type === "Consignment" &&
              receipt.stock_scheme === "accumulation" && (
                <Row
                  k="Sisa di rak"
                  v={formatQty(
                    i.remaining,
                    i.pcs_per_pack
                  )}
                />
              )}

            {receipt.transaction_type === "Consignment" && (
              <Row
                k="Retur fisik"
                v={formatQty(
                  i.returned,
                  i.pcs_per_pack
                )}
              />
            )}
          </div>
        ))}

        {hr}

        {prevDebt > 0 ? (
          <>
            <Row
              k="Utang Sebelumnya"
              v={rp(prevDebt)}
            />

            <Row
              k="Total Penjualan"
              v={rp(Number(receipt.total_sales))}
            />

            {discountAmount > 0 && (
              <Row
                k="Diskon Nota"
                v={`-${rp(discountAmount)}`}
              />
            )}

            <Row
              k="Total Tagihan"
              v={rp(Number(receipt.total_due))}
              bold
            />

            <Row
              k="Dibayar"
              v={rp(Number(receipt.amount_paid))}
            />

            <Row
              k="Sisa Utang"
              v={rp(Number(receipt.remaining_debt))}
              bold
            />
          </>
        ) : (
          <>
            {discountAmount > 0 && (
              <>
                <Row
                  k="Total Penjualan"
                  v={rp(Number(receipt.total_sales))}
                />

                <Row
                  k="Diskon Nota"
                  v={`-${rp(discountAmount)}`}
                />
              </>
            )}

            <div className="font-semibold">
              TOTAL TAGIHAN / DIBAYAR :{" "}
              {rp(Number(receipt.total_due))}{" "}
              (Status: Lunas / Tanpa Tunggakan) ✅
            </div>
          </>
        )}

        {newItems.length > 0 && (
          <>
            {hr}

            <div className="font-semibold">
              TITIP BARU HARI INI
            </div>

            {newItems.map((n, idx) => (
              <Row
                key={idx}
                k={`${n.name} (${formatQty(
                  n.qty,
                  n.pcs_per_pack
                )})`}
                v={`@ ${rp(n.price)}/pack`}
              />
            ))}
          </>
        )}

        {nextStock.length > 0 && (
          <>
            {hr}

            <div className="font-semibold">
              STOK UNTUK NOTA BERIKUTNYA
            </div>

            {nextStock.map((n, idx) => (
              <Row
                key={idx}
                k={n.name}
                v={formatQty(
                  n.qty,
                  n.pcs_per_pack
                )}
              />
            ))}
          </>
        )}

        {hr}

        {receipt.custom_note && (
          <p className="mb-2 whitespace-pre-wrap text-xs text-gray-500">
            {receipt.custom_note}
          </p>
        )}

        <div className="text-center">
          Terima Kasih 🙏
        </div>

        <div className="text-center italic">
          *Generated by Sales Pouch*
        </div>
      </article>

      <div className="mt-6 grid grid-cols-2 gap-3 print:hidden">
        <Button
          asChild
          variant="outline"
          className="col-span-2 h-12"
        >
          <Link
            to="/transactions/$id/edit"
            params={{ id }}
          >
            <FilePenLine className="mr-1 h-4 w-4" />
            Edit Transaksi & Revisi Nota
          </Link>
        </Button>

        <Button
          className="col-span-2 h-12"
          onClick={sendWa}
        >
          <MessageCircle className="mr-1 h-4 w-4" />
          Kirim ke WhatsApp Toko
        </Button>

        {isBluetoothPrintSupported() && (
          <Button
            className="col-span-2 h-12"
            variant="secondary"
            disabled={busy === "bt"}
            onClick={printBluetooth}
          >
            <Bluetooth className="mr-1 h-4 w-4" />
            {busy === "bt"
              ? "Mencetak…"
              : "Cetak via Printer Bluetooth"}
          </Button>
        )}

        <Button
          variant="outline"
          className="h-12"
          onClick={() => window.print()}
        >
          <Printer className="mr-1 h-4 w-4" />
          Cetak
        </Button>

        <Button
          variant="outline"
          className="h-12"
          disabled={busy === "share"}
          onClick={share}
        >
          <Share2 className="mr-1 h-4 w-4" />
          {busy === "share"
            ? "Menyiapkan gambar…"
            : "Bagikan (PNG)"}
        </Button>
      </div>
    </main>
  );
}

function Row({
  k,
  v,
  bold,
}: {
  k: string;
  v: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${
        bold ? "font-semibold" : ""
      }`}
    >
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
