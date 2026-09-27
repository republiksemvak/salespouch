import html2canvas from "html2canvas";
import { prepareReceipt } from "./receipt-image";

/**
 * Print the receipt to a Bluetooth thermal printer (ESC/POS raster, 58mm = 384 dots).
 * Uses Web Bluetooth — works in Chrome/Edge on Android & desktop.
 */

// Common ESC/POS BLE service/characteristic UUIDs used by cheap thermal printers.
const SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];
const CHARACTERISTICS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
];

const PRINTER_WIDTH = 384; // dots for 58mm printers

export const isBluetoothPrintSupported = () =>
  typeof navigator !== "undefined" && "bluetooth" in navigator;

/** Convert the receipt element to ESC/POS raster bytes (GS v 0). */
async function receiptToEscPos(el: HTMLElement): Promise<Uint8Array> {
  const restore = prepareReceipt(el);
  let src: HTMLCanvasElement;
  try {
    src = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  } finally {
    restore();
  }

  const canvas = document.createElement("canvas");
  canvas.width = PRINTER_WIDTH;
  canvas.height = Math.round((src.height / src.width) * PRINTER_WIDTH);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const bytesPerRow = width / 8;

  const out: number[] = [
    0x1b, 0x40, // ESC @ init
    0x1b, 0x61, 0x01, // center align
  ];

  for (let y = 0; y < height; y += 24) {
    const band = Math.min(24, height - y);
    out.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, 0x00, band & 0xff, 0x00);
    for (let row = 0; row < band; row++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          const i = ((y + row) * width + x) * 4;
          const lum = 0.299 * (data[i] ?? 255) + 0.587 * (data[i + 1] ?? 255) + 0.114 * (data[i + 2] ?? 255);
          if (lum < 140) byte |= 0x80 >> bit;
        }
        out.push(byte);
      }
    }
  }

  out.push(0x1b, 0x64, 0x05); // feed 5 lines
  out.push(0x1d, 0x56, 0x42, 0x00); // partial cut (ignored if unsupported)
  return new Uint8Array(out);
}

export async function printReceiptBluetooth(el: HTMLElement): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: any };
  if (!nav.bluetooth) throw new Error("Browser ini tidak mendukung Bluetooth. Gunakan Chrome di Android/PC.");

  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICES,
  });
  const server = await device.gatt.connect();

  let characteristic: any = null;
  for (const sUuid of SERVICES) {
    try {
      const service = await server.getPrimaryService(sUuid);
      for (const cUuid of CHARACTERISTICS) {
        try {
          characteristic = await service.getCharacteristic(cUuid);
          break;
        } catch { /* try next */ }
      }
      if (!characteristic) {
        const chars = await service.getCharacteristics();
        characteristic = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse) ?? null;
      }
      if (characteristic) break;
    } catch { /* try next service */ }
  }
  if (!characteristic) throw new Error("Printer ditemukan, tapi layanan cetaknya tidak dikenali.");

  const payload = await receiptToEscPos(el);
  const CHUNK = 180; // safe BLE MTU chunk
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.subarray(i, i + CHUNK);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  device.gatt.disconnect();
}
