/**
 * Cosmic aurora background — mirrors the landing page's atmosphere so the
 * dashboard reads as the same product. Fixed, behind all content (-z-10).
 * Render only for the obsidian (default dark) theme.
 */
export function CosmicBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#06070a]">
      {/* animated mesh blobs */}
      <div
        className="absolute -top-1/3 left-[6%] w-[55vw] h-[55vw] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, rgba(25,184,134,0.20), transparent 62%)", filter: "blur(70px)", animation: "fr-blobA 18s ease-in-out infinite" }}
      />
      <div
        className="absolute top-[18%] right-0 w-[48vw] h-[48vw] rounded-full opacity-45"
        style={{ background: "radial-gradient(circle, rgba(45,125,210,0.14), transparent 60%)", filter: "blur(80px)", animation: "fr-blobB 22s ease-in-out infinite" }}
      />
      <div
        className="absolute bottom-[-20%] left-[32%] w-[50vw] h-[50vw] rounded-full opacity-35"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.12), transparent 60%)", filter: "blur(90px)", animation: "fr-blobC 26s ease-in-out infinite" }}
      />
      {/* technical grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 110% 80% at 50% 0%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 110% 80% at 50% 0%, #000 35%, transparent 80%)",
        }}
      />
      {/* grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />
      {/* vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 35%, transparent 45%, rgba(6,7,10,0.7) 100%)" }} />
    </div>
  );
}
