import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { resolveImageSrc } from "@/lib/storage-images";
import { Button } from "@/components/ui/button";

const BUCKET = "product-images";

export function useImageSrc(value?: string | null) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!value) {
      setSrc(null);
      return;
    }
    // Short-lived links ensure removed members lose image access quickly.
    void resolveImageSrc(value).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [value]);

  return src;
}

/** Small square preview used in tables and detail pages. */
export function ImageThumb({
  value,
  alt = "",
  className = "size-10",
}: {
  value?: string | null;
  alt?: string;
  className?: string;
}) {
  const src = useImageSrc(value);
  if (!src) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-md border bg-muted text-muted-foreground`}
      >
        <ImagePlus className="size-4" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`${className} rounded-md border object-cover`}
    />
  );
}

type Props = {
  /** Current stored value: a storage path (preferred) or legacy URL. */
  value?: string | null;
  onChange: (value: string | null) => void;
  /** Used to scope uploads per tenant — required by storage access rules. */
  businessId?: string | null;
  id?: string;
  /** Max file size in MB (default 10). */
  maxSizeMB?: number;
  /** Visual style: compact inline control or a large dropzone. */
  variant?: "inline" | "dropzone";
  /** Dropzone copy. */
  hint?: string;
  subHint?: string;
  disabled?: boolean;
};

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/** Upload control that stores the image in cloud storage and shows a live preview. */
export function ImageUpload({
  value,
  onChange,
  businessId,
  id,
  maxSizeMB = 10,
  variant = "inline",
  hint = "Upload receipt or image",
  subHint,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const src = useImageSrc(value);

  const pick = async (file?: File | null) => {
    if (!file) return;
    if (!businessId) {
      toast.error("Select a business first");
      return;
    }
    if (!ACCEPTED.includes(file.type.toLowerCase())) {
      toast.error("Please choose a PNG, JPG or WEBP image");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${maxSizeMB}MB`);
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
      setFileName(file.name);
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const input = (
    <input
      id={id}
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      disabled={disabled}
      onChange={(e) => pick(e.target.files?.[0])}
    />
  );

  if (variant === "dropzone") {
    const displayName = fileName ?? (value ? value.split("/").pop() : null);
    return (
      <div>
        {input}
        {value ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-elevate-1">
            <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-muted">
              {src ? (
                <img src={src} alt="Attachment" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">Attached</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove attachment"
              disabled={disabled || uploading}
              onClick={() => {
                onChange(null);
                setFileName(null);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors press ${
              dragging ? "border-primary bg-accent/40" : "bg-muted/30 hover:bg-accent/30"
            }`}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud className="size-5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{uploading ? "Uploading…" : hint}</span>
            <span className="text-xs text-muted-foreground">
              {subHint ?? `PNG, JPG, WEBP up to ${maxSizeMB}MB`}
            </span>
          </button>
        )}
      </div>
    );
  }

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
        {input}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1 size-4" />
          )}
          {value ? "Replace" : "Upload image"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => onChange(null)}
          >
            <Trash2 className="mr-1 size-4" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
