import type { LucideIcon } from "lucide-react";
import {
  Briefcase, Home, TrendingUp, GraduationCap, Youtube, Megaphone,
  School, Mic, Scissors, Palette, PiggyBank, Building2, Gift,
  Receipt, ArrowLeftRight, Coins,
} from "lucide-react";

export type IncomeCurrency = "USD" | "EUR" | "INR";

export type IncomeStream = {
  id: string;
  name: string;
  type: "active" | "passive";
  icon: string;
  amount: number;
  currency: IncomeCurrency;
  exchangeRateToINR: number;
  isVisible: boolean;
  displayOrder: number;
};

export const DEFAULT_FX: Record<IncomeCurrency, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90,
};

export const ICON_MAP: Record<string, LucideIcon> = {
  Briefcase, Home, TrendingUp, GraduationCap, Youtube, Megaphone,
  School, Mic, Scissors, Palette, PiggyBank, Building2, Gift,
  Receipt, ArrowLeftRight, Coins,
};

export const getIcon = (name: string): LucideIcon => ICON_MAP[name] ?? Coins;

let _seq = 0;
const seed = (
  name: string,
  type: IncomeStream["type"],
  icon: string,
  amount: number,
  currency: IncomeCurrency,
): IncomeStream => ({
  id: `seed-${++_seq}`,
  name,
  type,
  icon,
  amount,
  currency,
  exchangeRateToINR: DEFAULT_FX[currency],
  isVisible: true,
  displayOrder: _seq,
});

export const SEED_STREAMS: IncomeStream[] = [
  seed("Salary", "active", "Briefcase", 5000, "USD"),
  seed("Rent", "passive", "Home", 25000, "INR"),
  seed("Dividend", "passive", "TrendingUp", 8000, "INR"),
  seed("Course", "passive", "GraduationCap", 1200, "USD"),
  seed("YouTube", "passive", "Youtube", 800, "USD"),
  seed("Sponsorship", "passive", "Megaphone", 1500, "EUR"),
  seed("College", "passive", "School", 15000, "INR"),
  seed("Interview", "passive", "Mic", 500, "USD"),
  seed("Editing", "passive", "Scissors", 600, "USD"),
  seed("Digital Art", "passive", "Palette", 400, "EUR"),
  seed("Interest", "passive", "PiggyBank", 4500, "INR"),
  seed("Business", "passive", "Building2", 75000, "INR"),
  seed("Bonus", "passive", "Gift", 50000, "INR"),
  seed("Tax Refund", "passive", "Receipt", 12000, "INR"),
  seed("Self Transfer", "passive", "ArrowLeftRight", 10000, "INR"),
];