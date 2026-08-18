import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Palette, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { notifyError } from "@/lib/errorMessages";
import { FinrootLogo } from "@/components/brand/FinrootLogo";
import {
  BRANDING_KEY,
  DEFAULT_BRANDING,
  normalizeBranding,
  type BrandingContent,
} from "@/hooks/useBranding";

// Accepted upload formats.
const ACCEPT = "image/svg+xml,image/png,image/jpeg,image/webp,image/gif,.svg,.png,.jpg,.jpeg,.webp,.gif";
const MAX_DIM = 256;            // raster logos are downscaled to this (px, longest side)
const MAX_FILE = 3 * 1024 * 1024; // 3 MB source guard

export const BRANDING_BUCKET = "branding";

/** `logo/<timestamp>-<name>` — a new object per upload, so caches never stick. */
function brandingLogoPath(fileName: string, mime: string): string {
  const ext = mime === "image/svg+xml" ? "svg" : mime === "image/png" ? "png" : "img";
  const base = (fileName.split(/[\\/]/).pop() ?? "logo")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\.[^.]*$/, "")
    .slice(0, 60) || "logo";
  return `logo/${Date.now()}-${base}.${ext}`;
}

/**
 * Normalise an uploaded image to the bytes we want to store.
 *
 * SVG passes through as-is; raster is downscaled to MAX_DIM and re-encoded as
 * PNG, which is why an oversized photo never reaches the bucket at full size.
 */
async function fileToLogoBlob(file: File): Promise<Blob> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (isSvg) {
    // Served from the bucket and rendered via <img>, where scripts do not run.
    return new Blob([await file.text()], { type: "image/svg+xml" });
  }

  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode failed"));
    img.src = sourceUrl;
  });

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  // PNG keeps transparency; logos are small so size stays modest.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("encode failed");
  return blob;
}

export default function PoBranding() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["po-branding"],
    queryFn: async (): Promise<BrandingContent> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", BRANDING_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeBranding(data?.value ?? null);
    },
  });

  const [content, setContent] = useState<BrandingContent>(DEFAULT_BRANDING);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setContent(data);
  }, [data]);

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_FILE) {
      toast.error("Image is too large (max 3 MB). Try a smaller file.");
      return;
    }
    setProcessing(true);
    try {
      // Stage 3.3: the logo is uploaded to the public `branding` bucket and the
      // setting stores a URL, not a data URI. The bucket independently enforces
      // the 2 MB cap and the image MIME allow-list, so a client that skipped the
      // check above still cannot store arbitrary bytes.
      const blob = await fileToLogoBlob(file);
      const path = brandingLogoPath(file.name, blob.type);
      const { error: upErr } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
      setContent((c) => ({ ...c, logoUrl: pub.publicUrl }));
      toast.success("Logo uploaded — click “Save changes” to publish");
    } catch (e) {
      notifyError(e, { title: "Couldn’t upload that image" });
    } finally {
      setProcessing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const payload: BrandingContent = {
      appName: content.appName.trim() || DEFAULT_BRANDING.appName,
      tagline: content.tagline.trim() || DEFAULT_BRANDING.tagline,
      logoUrl: content.logoUrl && content.logoUrl.trim() ? content.logoUrl.trim() : null,
    };
    const { error } = await supabase.rpc("po_set_site_setting", {
      p_key: BRANDING_KEY,
      p_value: payload as unknown as Json,
    });
    setSaving(false);
    if (error) return notifyError(error);
    toast.success("Branding updated — live across the app");
    refetch();
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const logoKb = content.logoUrl?.startsWith("data:")
    ? Math.round((content.logoUrl.length * 0.75) / 1024)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> Branding
          </h1>
          <p className="text-sm text-muted-foreground">
            Set the app name and logo. Changes reflect on the landing page, the dashboard,
            the sign-in screen and the browser tab — immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </a>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Preview</div>
        <div className="flex items-center gap-3">
          {content.logoUrl ? (
            <img src={content.logoUrl} alt={content.appName} className="h-10 w-10 rounded-[2px] object-contain" />
          ) : (
            <FinrootLogo className="h-10 w-10 rounded-[2px]" />
          )}
          <div>
            <div className="font-display text-lg font-bold text-gradient-primary">{content.appName || "—"}</div>
            <div className="text-xs text-muted-foreground">{content.tagline}</div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="appName">Application name</Label>
          <Input
            id="appName"
            value={content.appName}
            onChange={(e) => setContent((c) => ({ ...c, appName: e.target.value }))}
            placeholder="FinRoot"
          />
        </div>

        {/* Logo upload */}
        <div className="space-y-2">
          <Label>Logo</Label>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-border/60 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[2px] bg-muted/40 shrink-0">
              {content.logoUrl ? (
                <img src={content.logoUrl} alt="Logo preview" className="h-12 w-12 rounded-[2px] object-contain" />
              ) : (
                <FinrootLogo className="h-12 w-12 rounded-[2px]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={processing} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {processing ? "Processing…" : content.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {content.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-coral hover:text-coral" onClick={() => setContent((c) => ({ ...c, logoUrl: null }))}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                SVG, PNG, JPG, WebP or GIF. Square works best; raster images are auto-resized to {MAX_DIM}px.
                {logoKb !== null && <span className="ml-1 text-foreground/70">· ~{logoKb} KB</span>}
                {!content.logoUrl && <span className="ml-1">Blank uses the built-in mark.</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={content.tagline}
            onChange={(e) => setContent((c) => ({ ...c, tagline: e.target.value }))}
            placeholder="The calm, intelligent wealth OS for modern households."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
