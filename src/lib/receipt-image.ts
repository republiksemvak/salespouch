/**
 * Render receipt text lines into a monochrome PNG canvas.
 * Drawn manually (no DOM capture) so it works everywhere and prints crisply
 * on thermal printers.
 */

export type ReceiptLine = { text: string; bold?: boolean; center?: boolean };

const FONT = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';

export function receiptTextToCanvas(lines: ReceiptLine[], width = 640): HTMLCanvasElement {
  const pad = 28;
  const fontSize = 26;
  const lineHeight = 38;

  const measure = document.createElement("canvas").getContext("2d")!;
  const setFont = (bold?: boolean) => {
    measure.font = `${bold ? "700" : "400"} ${fontSize}px ${FONT}`;
  };

  // Word-wrap long lines to fit the width.
  const wrapped: ReceiptLine[] = [];
  for (const line of lines) {
    setFont(line.bold);
    if (measure.measureText(line.text).width <= width - pad * 2 || !line.text) {
      wrapped.push(line);
      continue;
    }
    let rest = line.text;
    while (rest) {
      let end = rest.length;
      while (end > 1 && measure.measureText(rest.slice(0, end)).width > width - pad * 2) end--;
      const cut = rest.lastIndexOf(" ", end);
      if (cut > 0) end = cut;
      wrapped.push({ ...line, text: rest.slice(0, end) });
      rest = rest.slice(end).trimStart();
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = pad * 2 + wrapped.length * lineHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  wrapped.forEach((line, i) => {
    ctx.font = `${line.bold ? "700" : "400"} ${fontSize}px ${FONT}`;
    const y = pad + i * lineHeight;
    if (line.center) {
      ctx.textAlign = "center";
      ctx.fillText(line.text, width / 2, y);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(line.text, pad, y);
    }
  });
  return canvas;
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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

/** Share receipt lines as a PNG file; falls back to download when file sharing is unsupported. */
export async function shareReceiptPng(lines: ReceiptLine[], filename: string): Promise<"shared" | "downloaded"> {
  const blob = await canvasToPngBlob(receiptTextToCanvas(lines));
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return "shared";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
