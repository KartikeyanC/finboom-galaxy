import { useEffect } from "react";
import { useBranding } from "@/hooks/useBranding";

/**
 * Keeps the browser tab title AND favicon in sync with the PO-configured brand.
 * Rendered once at the app root so it applies across every route.
 */
export function BrandDocumentTitle() {
  const { appName, logoUrl } = useBranding();

  useEffect(() => {
    document.title = `${appName} — Wealth OS for Modern Households`;
  }, [appName]);

  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"));
    if (logoUrl) {
      // Point every icon link at the custom logo so the tab icon updates too.
      const targets = links.length ? links : [createIconLink()];
      targets.forEach((l) => {
        l.removeAttribute("sizes");
        l.type = logoUrl.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
        l.href = logoUrl;
      });
    } else {
      // No custom logo → restore the built-in favicon.
      links.forEach((l) => {
        if (l.type === "image/svg+xml" || !l.getAttribute("sizes")) l.href = "/favicon.svg";
      });
    }
  }, [logoUrl]);

  return null;
}

function createIconLink(): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}
