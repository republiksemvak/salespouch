import html2canvas from "html2canvas";

/**
 * Force plain black-on-white styles during capture: html2canvas cannot parse
 * oklch/theme colors, and the zigzag clip-path would cut the image.
 */
export function prepareReceipt(el: HTMLElement) {
  const nodes = [el, ...el.querySelectorAll<HTMLElement>("*")];
  const saved = nodes.map((n) => ({ n, css: n.style.cssText }));
  el.style.background = "#ffffff";
  el.style.boxShadow = "none";
  el.style.clipPath = "none";
  for (const n of nodes) {
    n.style.color = "#000000";
    n.style.borderColor = "#000000";
  }
  return () => saved.forEach(({ n, css }) => (n.style.cssText = css));
}

/** Render the receipt DOM node into a PNG blob (2x scale for crisp sharing/printing). */
export async function receiptToPng(el: HTMLElement): Promise<Blob> {
  const restore = prepareReceipt(el);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  } finally {
    restore();
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Gagal membuat gambar nota");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Share the receipt as a PNG file; falls back to download when file sharing is unsupported. */
export async function shareReceiptPng(el: HTMLElement, filename: string): Promise<"shared" | "downloaded"> {
  const blob = await receiptToPng(el);
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return "shared";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
