import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageThumb } from "@/components/image-upload";

type Props = { businessId: string | null; images: string[]; onChange: (images: string[]) => void };
export function ItemImages({ businessId, images, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!cameraOpen) return;
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(() => {
        if (active) setCameraError(true);
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);
  async function upload(file: File) {
    if (!businessId) {
      toast.error("Select a business first");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      toast.error("Choose a JPG, PNG or WEBP image under 10 MB");
      return;
    }
    setBusy(true);
    try {
      const extension =
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${businessId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      onChange([...images, path]);
      setCameraOpen(false);
      setShot(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  function shutter() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setShot(canvas.toDataURL("image/jpeg", 0.85));
  }
  async function acceptPhoto() {
    if (!shot) return;
    const blob = await (await fetch(shot)).blob();
    await upload(new File([blob], "camera.jpg", { type: "image/jpeg" }));
  }
  function takePhoto() {
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) captureRef.current?.click();
    else {
      setCameraError(false);
      setShot(null);
      setCameraOpen(true);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) void upload(f);
            e.target.value = "";
          }}
        />
        <input
          ref={captureRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files?.[0] as File);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" /> Choose images
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={takePhoto}>
          <Camera className="size-4" /> Take photo
        </Button>
        {busy && <Loader2 className="size-4 animate-spin" />}
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((path, i) => (
            <div key={`${path}-${i}`} className="space-y-1">
              <ImageThumb
                value={path}
                alt={`Item image ${i + 1}`}
                className="aspect-square w-full"
              />
              <div className="flex justify-between">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={i === 0}
                  title="Set primary"
                  aria-label="Set primary image"
                  onClick={() => onChange([path, ...images.filter((_, n) => n !== i)])}
                >
                  <Star className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove image"
                  onClick={() => onChange(images.filter((_, n) => n !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take photo</DialogTitle>
            <DialogDescription>Use your camera to add an item image.</DialogDescription>
          </DialogHeader>
          {cameraError ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Camera unavailable or permission denied. Choose an image instead.
            </p>
          ) : shot ? (
            <img src={shot} alt="Captured photo" className="w-full rounded-md" />
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="w-full rounded-md bg-muted"
            />
          )}
          <div className="flex gap-2">
            {cameraError ? (
              <Button
                type="button"
                onClick={() => {
                  setCameraOpen(false);
                  fileRef.current?.click();
                }}
              >
                Choose images
              </Button>
            ) : shot ? (
              <>
                <Button type="button" variant="outline" onClick={() => setShot(null)}>
                  Retake
                </Button>
                <Button type="button" disabled={busy} onClick={() => void acceptPhoto()}>
                  Use photo
                </Button>
              </>
            ) : (
              <Button type="button" onClick={shutter}>
                Capture
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
