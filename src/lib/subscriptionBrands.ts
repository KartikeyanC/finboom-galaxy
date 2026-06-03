import { Film, Music2, Cloud, Sparkles, Palette, Package, Tv, Gamepad2, Youtube, Github, BookOpen, Dumbbell, Mail, ShoppingBag, Video, Briefcase, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BrandStyle {
  Icon: LucideIcon;
  /** Tailwind gradient for the tile background */
  gradient: string;
  /** Tailwind text color for the icon */
  iconClass: string;
  /** Tailwind ring/border accent */
  ring: string;
}

const FALLBACK: BrandStyle = {
  Icon: CreditCard,
  gradient: "from-slate-500/20 to-slate-700/20",
  iconClass: "text-slate-300",
  ring: "ring-slate-500/30",
};

const BRANDS: Array<{ match: RegExp; style: BrandStyle }> = [
  { match: /netflix/i,            style: { Icon: Film,      gradient: "from-red-500/25 to-rose-700/25",      iconClass: "text-red-400",       ring: "ring-red-500/30" } },
  { match: /spotify/i,            style: { Icon: Music2,    gradient: "from-emerald-400/25 to-green-600/25", iconClass: "text-emerald-400",   ring: "ring-emerald-500/30" } },
  { match: /apple\s?music/i,      style: { Icon: Music2,    gradient: "from-pink-500/25 to-rose-600/25",     iconClass: "text-pink-400",      ring: "ring-pink-500/30" } },
  { match: /icloud|apple\s?one/i, style: { Icon: Cloud,     gradient: "from-sky-400/25 to-blue-600/25",      iconClass: "text-sky-300",       ring: "ring-sky-500/30" } },
  { match: /chatgpt|openai/i,     style: { Icon: Sparkles,  gradient: "from-teal-400/25 to-emerald-600/25",  iconClass: "text-teal-300",      ring: "ring-teal-500/30" } },
  { match: /claude|anthropic/i,   style: { Icon: Sparkles,  gradient: "from-amber-400/25 to-orange-600/25",  iconClass: "text-amber-300",     ring: "ring-amber-500/30" } },
  { match: /adobe/i,              style: { Icon: Palette,   gradient: "from-rose-500/25 to-red-700/25",      iconClass: "text-rose-400",      ring: "ring-rose-500/30" } },
  { match: /figma/i,              style: { Icon: Palette,   gradient: "from-violet-500/25 to-fuchsia-700/25",iconClass: "text-violet-400",    ring: "ring-violet-500/30" } },
  { match: /amazon|prime/i,       style: { Icon: Package,   gradient: "from-amber-400/25 to-orange-600/25",  iconClass: "text-amber-300",     ring: "ring-amber-500/30" } },
  { match: /disney|hotstar/i,     style: { Icon: Tv,        gradient: "from-blue-500/25 to-indigo-700/25",   iconClass: "text-blue-300",      ring: "ring-blue-500/30" } },
  { match: /hbo|max\b/i,          style: { Icon: Tv,        gradient: "from-purple-500/25 to-indigo-700/25", iconClass: "text-purple-300",    ring: "ring-purple-500/30" } },
  { match: /youtube/i,            style: { Icon: Youtube,   gradient: "from-red-500/25 to-rose-700/25",      iconClass: "text-red-400",       ring: "ring-red-500/30" } },
  { match: /github|copilot/i,     style: { Icon: Github,    gradient: "from-zinc-500/25 to-zinc-800/25",     iconClass: "text-zinc-200",      ring: "ring-zinc-500/30" } },
  { match: /xbox|game\s?pass|playstation|steam/i, style: { Icon: Gamepad2, gradient: "from-green-500/25 to-emerald-700/25", iconClass: "text-green-400", ring: "ring-green-500/30" } },
  { match: /kindle|audible|book/i,style: { Icon: BookOpen,  gradient: "from-orange-400/25 to-amber-700/25",  iconClass: "text-orange-300",    ring: "ring-orange-500/30" } },
  { match: /gym|fitness|peloton/i,style: { Icon: Dumbbell,  gradient: "from-lime-400/25 to-green-600/25",    iconClass: "text-lime-300",      ring: "ring-lime-500/30" } },
  { match: /google|gmail|workspace/i, style: { Icon: Mail,  gradient: "from-blue-500/25 to-sky-700/25",      iconClass: "text-blue-300",      ring: "ring-blue-500/30" } },
  { match: /shopify|store|swiggy|zomato/i, style: { Icon: ShoppingBag, gradient: "from-emerald-500/25 to-teal-700/25", iconClass: "text-emerald-300", ring: "ring-emerald-500/30" } },
  { match: /zoom|meet|webex/i,    style: { Icon: Video,     gradient: "from-sky-500/25 to-blue-700/25",      iconClass: "text-sky-300",       ring: "ring-sky-500/30" } },
  { match: /notion|slack|office|microsoft|365/i, style: { Icon: Briefcase, gradient: "from-indigo-500/25 to-violet-700/25", iconClass: "text-indigo-300", ring: "ring-indigo-500/30" } },
];

export function resolveBrand(name: string): BrandStyle {
  for (const { match, style } of BRANDS) if (match.test(name)) return style;
  return FALLBACK;
}