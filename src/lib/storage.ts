import { supabase } from "@/integrations/supabase/client";

const MAX_SIZE = 5 * 1024 * 1024;

export async function uploadUserFile(
  bucket: "avatars" | "provider-photos" | "provider-docs",
  userId: string,
  file: File,
  prefix: string,
): Promise<string> {
  if (file.size > MAX_SIZE) throw new Error("Max file size is 5 MB");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;

  if (bucket === "provider-docs") return path;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
