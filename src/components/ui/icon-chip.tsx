import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/incomeSeed";

/**
 * Tinted glass icon tile — matches the dashboard / glass-dashboard pattern:
 * a translucent square in the icon's hue, a hairline same-hue border, and a
 * clean colored line glyph. Flat and calm (no gloss/gradient), so it sits
 * naturally on the frosted cards. Brightens on a parent `.group` hover.
 * Per-icon hues as [h, s, l]; unknown icons fall back to brand emerald.
 */
const ICON_HUES: Record<string, [number, number, number]> = {
  Briefcase: [217, 85, 58],      // blue — salary / work
  Home: [25, 90, 55],            // orange — rent / home
  TrendingUp: [160, 70, 45],     // emerald — dividends / growth
  GraduationCap: [262, 75, 62],  // violet — courses
  Youtube: [0, 78, 60],          // red — YouTube
  Megaphone: [330, 75, 60],      // pink — sponsorship
  School: [199, 85, 55],         // sky — college
  Mic: [271, 80, 64],            // purple — interviews / podcast
  Scissors: [188, 80, 48],       // cyan — editing
  Palette: [292, 75, 60],        // fuchsia — digital art
  PiggyBank: [340, 78, 62],      // rose — interest / savings
  Building2: [243, 70, 64],      // indigo — business
  Gift: [350, 80, 60],           // warm red — bonus
  Receipt: [43, 90, 52],         // amber — tax refund / bills
  ArrowLeftRight: [173, 70, 46], // teal — transfers
  Coins: [45, 85, 55],           // gold — default money
};

const FALLBACK: [number, number, number] = [160, 64, 46];

const SIZES = {
  sm: { box: "w-9 h-9 rounded-[10px]", icon: "w-4 h-4" },
  md: { box: "w-11 h-11 rounded-xl", icon: "w-[18px] h-[18px]" },
  lg: { box: "w-12 h-12 rounded-xl", icon: "w-5 h-5" },
} as const;

interface IconChipProps {
  /** Icon key from ICON_MAP (e.g. "Briefcase"). Unknown keys render Coins. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function IconChip({ name, size = "md", className }: IconChipProps) {
  const Icon = getIcon(name);
  const [h, s, l] = ICON_HUES[name] ?? FALLBACK;
  const glyph = `hsl(${h} ${s}% ${Math.min(l + 16, 70)}%)`;

  return (
    <div
      className={cn(SIZES[size].box, "relative flex items-center justify-center shrink-0 overflow-hidden transition-colors duration-300", className)}
      style={{
        backgroundColor: `hsl(${h} ${s}% ${l}% / 0.12)`,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `hsl(${h} ${s}% ${l}% / 0.28)`,
      }}
    >
      {/* extra tint on card hover */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ backgroundColor: `hsl(${h} ${s}% ${l}% / 0.12)` }}
        aria-hidden
      />
      <Icon className={cn(SIZES[size].icon, "relative")} style={{ color: glyph }} strokeWidth={2} />
    </div>
  );
}
