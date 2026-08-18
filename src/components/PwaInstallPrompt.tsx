import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBranding } from "@/hooks/useBranding";
import { usePwaInstall } from "@/hooks/usePwaInstall";

const DISMISS_KEY = "finroot.pwa.installDismissed";

/**
 * Self-contained bottom "Install app" prompt.
 * - Android / desktop Chrome: native install via the captured beforeinstallprompt.
 * - iOS Safari (no native prompt): Add-to-Home-Screen guidance.
 * Dismissal is remembered so it never nags.
 */
export default function PwaInstallPrompt() {
  const { canPrompt, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const { appName } = useBranding();
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone || localStorage.getItem(DISMISS_KEY)) return;
    if (canPrompt) setVisible(true);
  }, [canPrompt, isStandalone]);

  useEffect(() => {
    if (isStandalone || localStorage.getItem(DISMISS_KEY) || !isIOS) return;
    const t = setTimeout(() => {
      setIosHint(true);
      setVisible(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [isIOS, isStandalone]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };
  const install = async () => {
    await promptInstall();
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
        <BrandLogo className="h-10 w-10 shrink-0 rounded-[2px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install {appName}</p>
          {iosHint ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              Tap <Share className="inline h-3.5 w-3.5" /> then “Add to Home Screen”.
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Add to your home screen for a full-screen, app-like experience.
            </p>
          )}
        </div>
        {!iosHint && (
          <Button size="sm" onClick={install} className="h-9 shrink-0">
            <Download className="mr-1.5 h-4 w-4" /> Install
          </Button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
