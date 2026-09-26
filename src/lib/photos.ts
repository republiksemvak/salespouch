import { supabase } from "@/integrations/supabase/client";

export async function uploadStorePhoto(file: File) {
  const { data: u } = await supabase.auth.getUser();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${u.user!.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("store-photos").upload(path, file, { contentType: file.type });
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
