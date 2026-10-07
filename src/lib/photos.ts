import { supabase } from "@/integrations/supabase/client";

const MAX_PHOTO_SIZE = 900;
const MAX_PHOTO_BYTES = 250 * 1024;
const PHOTO_QUALITY = 0.68;

async function compressPhoto(file: File) {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = PHOTO_QUALITY;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob || blob.size <= MAX_PHOTO_BYTES || quality <= 0.5) break;
      quality -= 0.06;
    }

    if (!blob) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export async function uploadStorePhoto(file: File) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Masuk akun untuk mengunggah foto.");
  const { data: owner, error: ownerError } = await supabase.rpc("business_owner_id");
  if (ownerError || !owner) throw ownerError ?? new Error("Usaha tidak ditemukan.");

  const compressedFile = await compressPhoto(file);
  const path = `${owner}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("store-photos")
    .upload(path, compressedFile, { contentType: "image/jpeg" });

  if (error) throw error;
  return path;
}

export async function signedPhotoUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from("store-photos").createSignedUrls(paths, 3600);
  const map: Record<string, string> = {};
  data?.forEach((d) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
  return map;
}
