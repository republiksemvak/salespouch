/** Inventory and transaction quantities are stored as whole pieces. Prices are per pack. */
export function packSize(value?: number | null) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

export function formatQty(pieces: number, size?: number | null) {
  const count = Math.max(0, Math.round(Number(pieces) || 0));
  const perPack = packSize(size);
  if (perPack === 1) return `${count} pcs`;
  const packs = Math.floor(count / perPack);
  const remainder = count % perPack;
  return [packs ? `${packs} pack` : "", remainder ? `${remainder} pcs` : ""].filter(Boolean).join(" + ") || "0 pcs";
}

export function toPieces(packs: number, pieces: number, size: number) {
  return packs * packSize(size) + pieces;
}

export function proportionalPrice(pieces: number, packPrice: number, size: number) {
  return Math.round((pieces * packPrice) / packSize(size));
}