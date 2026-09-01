import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "product-images";

/** Resolves a stored value (storage path or absolute URL) to a viewable image src. */
export function useImageSrc(value?: string | null) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!value) {
      setSrc(null);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(value)) {
      setSrc(value);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(value, 60 * 60)
      .then(({ data }) => {
        if (active) setSrc(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  return src;
}

/** Small square preview used in tables and detail pages. */
export function ImageThumb({ value, alt = "", className = "size-10" }: { value?: string | null; alt?: string; className?: string }) {
  const src = useImageSrc(value);
  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center rounded-md border bg-muted text-muted-foreground`}>
        <ImagePlus className="size-4" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={`${className} rounded-md border object-cover`} />;
}

type Props = {
  /** Current stored value: a storage path (preferred) or legacy URL. */
  value?: string | null;
  onChange: (value: string | null) => void;
  /** Used to scope uploads per tenant — required by storage access rules. */
  businessId?: string | null;
  id?: string;
};

/** Upload control that stores the image in cloud storage and shows a live preview. */
export function ImageUpload({ value, onChange, businessId, id }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const src = useImageSrc(value);

  const pick = async (file?: File | null) => {
    if (!file) return;
    if (!businessId) {
      toast.error("Select a business first");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      onChange(path);
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
        {src ? (
          <img src={src} alt="Product" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImagePlus className="size-5" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <ImagePlus className="mr-1 size-4" />}
          {value ? "Replace" : "Upload image"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 className="mr-1 size-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
