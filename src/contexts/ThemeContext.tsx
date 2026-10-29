import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * NineFlow's theme model (design-system/finroot-nineflow-tokens.css): a light/dark
 * **mode** and a separate colour **palette**. Mode is the `dark` class on <html>;
 * the palette is `data-theme` (absent for the default FinRoot green).
 */
export type ThemeMode = "light" | "dark";
export type PaletteId = "default" | "ocean" | "forest" | "berry" | "graphite";

export type PalettePreset = {
  id: PaletteId;
  label: string;
  /** [page, accent] in light mode, for the picker swatch. */
  swatch: [string, string];
};

export const PALETTES: PalettePreset[] = [
  { id: "default", label: "FinRoot", swatch: ["#FAF7F0", "#0D7A5F"] },
  { id: "ocean", label: "Ocean", swatch: ["#F3F7FC", "#2563EB"] },
  { id: "forest", label: "Forest", swatch: ["#F4F8F3", "#16805A"] },
  { id: "berry", label: "Berry", swatch: ["#FCF5F8", "#BE2469"] },
  { id: "graphite", label: "Graphite", swatch: ["#F4F4F5", "#6348DC"] },
];

/**
 * One device-local key (registered in lib/deviceLocal.ts), stored as "mode/palette".
 * Values written before the NineFlow redesign were a single preset id; they map to
 * the nearest mode and palette so nobody's choice is lost.
 */
const STORAGE_KEY = "finroot.theme";
const LEGACY: Record<string, [ThemeMode, PaletteId]> = {
  obsidian: ["dark", "default"],
  light: ["light", "default"],
  cyber: ["dark", "ocean"],
  mint: ["dark", "forest"],
  copper: ["dark", "default"],
};

export function parseStoredTheme(raw: string | null): [ThemeMode, PaletteId] {
  if (!raw) return ["light", "default"];
  if (LEGACY[raw]) return LEGACY[raw];
  const [mode, palette] = raw.split("/");
  return [
    mode === "dark" ? "dark" : "light",
    PALETTES.some((p) => p.id === palette) ? (palette as PaletteId) : "default",
  ];
}

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  palette: PaletteId;
  setPalette: (p: PaletteId) => void;
  palettes: PalettePreset[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(mode: ThemeMode, palette: PaletteId) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  if (palette === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", palette);
  // Help native UI (scrollbars, form controls) match the surface
  root.style.colorScheme = mode;
}

function readStored(): [ThemeMode, PaletteId] {
  try {
    return parseStoredTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return ["light", "default"];
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [[mode, palette], setState] = useState<[ThemeMode, PaletteId]>(() => {
    const initial = readStored();
    // Apply synchronously so the first paint already matches the saved theme.
    if (typeof document !== "undefined") applyTheme(...initial);
    return initial;
  });

  useEffect(() => {
    applyTheme(mode, palette);
    try {
      localStorage.setItem(STORAGE_KEY, `${mode}/${palette}`);
    } catch {
      /* ignore */
    }
  }, [mode, palette]);

  const setMode = useCallback((m: ThemeMode) => setState(([, p]) => [m, p]), []);
  const setPalette = useCallback((p: PaletteId) => setState(([m]) => [m, p]), []);

  return (
    <ThemeContext.Provider
      value={{ mode, setMode, isDark: mode === "dark", palette, setPalette, palettes: PALETTES }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
