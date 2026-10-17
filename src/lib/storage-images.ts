import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";

/** Resolves a stored value (storage path or absolute URL) to a viewable image src. */
export async function resolveImageSrc(value?: string | null) {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/.test(value)) return value;

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value, 60);
    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}
