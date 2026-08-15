import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeId = "obsidian" | "light" | "cyber" | "mint" | "copper";

export type ThemePreset = {
  id: ThemeId;
  label: string;
  description: string;
  /** Swatch colors for the preview chip (background, surface, primary, accent). */
  swatch: [string, string, string, string];
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "light",
    label: "Crisp Light",
    description: "Clean white surfaces, sharp borders.",
    swatch: ["#FFFFFF", "#F8FAFC", "#15A06B", "#0F172A"],
  },
  {
    id: "obsidian",
    label: "Premium Dark Obsidian",
    description: "Slate canvas with vibrant accents.",
    swatch: ["#0F172A", "#1A2233", "#22C5A0", "#F8FAFC"],
  },
  {
    id: "cyber",
    label: "Electric Cyber Blue",
    description: "Deep tech dark with neon blue accents.",
    swatch: ["#06121F", "#0C1E2E", "#0A9BDF", "#7FD8FF"],
  },
  {
    id: "mint",
    label: "Mint Wealth",
    description: "Rich emerald highlights on deep dark.",
    swatch: ["#0A1410", "#10221B", "#10B981", "#6EE7B7"],
  },
  {
    id: "copper",
    label: "Sunset Copper",
    description: "Warm amber/orange on modern dark.",
    swatch: ["#150E08", "#241710", "#F97316", "#FDBA74"],
  },
];

const STORAGE_KEY = "finroot.theme";
const DEFAULT_THEME: ThemeId = "obsidian";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  presets: ThemePreset[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === "obsidian") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  // Help native UI (scrollbars, form controls) match the surface
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (raw && THEME_PRESETS.some((p) => p.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const initial = readStoredTheme();
    // Apply synchronously so the first paint already matches the saved theme.
    if (typeof document !== "undefined") applyTheme(initial);
    return initial;
  });

  // Re-apply whenever the theme changes (also covers HMR / future updates).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, presets: THEME_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}