import { useTheme } from "@/contexts/ThemeContext";

/**
 * Chart palette — multicolour, but GREEN-FORWARD: every other entry is a green
 * (indices 0,2,4,6,8,10 → ~50% greens), interleaved with blue / gold / coral /
 * purple / pink / orange so many slices stay distinguishable while the deck
 * still reads on-brand. Two theme-tuned decks: deeper, saturated colours for
 * light backgrounds; brighter colours for dark canvases.
 */
const PALETTE_LIGHT = [
  "hsl(152, 63%, 42%)", // emerald (green)
  "hsl(212, 70%, 52%)", // blue
  "hsl(122, 48%, 44%)", // leaf (green)
  "hsl(43, 80%, 48%)", //  gold
  "hsl(172, 58%, 40%)", // teal (green)
  "hsl(13, 74%, 56%)", //  coral
  "hsl(93, 48%, 44%)", //  olive (green)
  "hsl(268, 55%, 60%)", // purple
  "hsl(160, 52%, 46%)", // mint (green)
  "hsl(332, 64%, 58%)", // pink
  "hsl(140, 44%, 36%)", // forest (green)
  "hsl(27, 82%, 54%)", //  orange
];

const PALETTE_DARK = [
  "hsl(152, 58%, 58%)", // emerald (green)
  "hsl(212, 74%, 66%)", // blue
  "hsl(122, 50%, 60%)", // leaf (green)
  "hsl(45, 78%, 62%)", //  gold
  "hsl(172, 56%, 56%)", // teal (green)
  "hsl(13, 80%, 66%)", //  coral
  "hsl(93, 50%, 60%)", //  olive (green)
  "hsl(268, 70%, 74%)", // purple
  "hsl(160, 56%, 62%)", // mint (green)
  "hsl(332, 74%, 70%)", // pink
  "hsl(140, 48%, 56%)", // forest (green)
  "hsl(30, 84%, 64%)", //  orange
];

/** i-th chart colour, theme-aware. Cycles the palette for large datasets. */
export function chartColor(i: number, dark = false): string {
  const deck = dark ? PALETTE_DARK : PALETTE_LIGHT;
  return deck[((i % deck.length) + deck.length) % deck.length];
}

/**
 * Back-compat green-only shade (kept for any caller that wants a pure-green
 * ramp). Most charts now use {@link chartColor}.
 */
export function greenShade(i: number, n: number, dark = false): string {
  const t = n <= 1 ? 0.15 : i / (n - 1);
  const hue = 150 - t * 88;
  const alt = i % 2 === 1 ? 1 : 0;
  if (dark) {
    const light = 64 - t * 4 + alt * 6;
    const sat = 56 + t * 14;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }
  const light = 44 - t * 4 + alt * 8;
  const sat = 52 + t * 18;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** True when the active theme uses a dark canvas (everything except "light"). */
export function useChartDark(): boolean {
  const { theme } = useTheme();
  return theme !== "light";
}
