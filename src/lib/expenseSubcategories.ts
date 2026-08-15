import { useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import type { CustomSubcategories } from "@/lib/tenantSettings";
import {
  Utensils,
  Car,
  Clapperboard,
  Home,
  Stethoscope,
  ShoppingBag,
  GraduationCap,
  CreditCard,
  PartyPopper,
  Receipt,
} from "lucide-react";

export interface ExpenseCategoryGroup {
  name: string;
  /** Real Lucide icon component (not an emoji). */
  icon: LucideIcon;
  subs: string[];
}

export const EXPENSE_CATEGORY_GROUPS: ExpenseCategoryGroup[] = [
  {
    name: "Food & Dining",
    icon: Utensils,
    subs: [
      "Outside Food",
      "Room Cooking / Groceries",
      "Snacks",
      "Sweets",
      "Nuts & Dry Fruits",
      "Ice Creams",
      "Beverages / Cafe",
    ],
  },
  {
    name: "Travel & Transport",
    icon: Car,
    subs: [
      "Commute (Home to Office)",
      "Event/Leisure Travel",
      "Temple Visits",
      "Hill Stations",
      "International Travel",
      "Fuel",
      "Vehicle Maintenance",
    ],
  },
  {
    name: "Entertainment & Leisure",
    icon: Clapperboard,
    subs: [
      "Streaming Services",
      "Movies / Theater",
      "Gaming",
      "Sports / Gym",
      "Hobbies",
      "Books & Magazines",
    ],
  },
  {
    name: "Housing & Utilities",
    icon: Home,
    subs: ["Rent", "Electricity", "Water", "Internet", "Gas", "Home Maintenance", "Furniture"],
  },
  {
    name: "Healthcare & Wellness",
    icon: Stethoscope,
    subs: [
      "Doctor Consultations",
      "Medicines",
      "Health Insurance",
      "Gym / Fitness",
      "Wellness / Spa",
      "Mental Health",
    ],
  },
  {
    name: "Shopping & Personal",
    icon: ShoppingBag,
    subs: [
      "Clothing",
      "Footwear",
      "Accessories",
      "Personal Care",
      "Grooming",
      "Electronics",
      "Gadgets",
    ],
  },
  {
    name: "Education & Development",
    icon: GraduationCap,
    subs: [
      "Course Fees",
      "Online Courses",
      "Books",
      "Certifications",
      "Workshops",
      "Study Materials",
    ],
  },
  {
    name: "Debt & Shared Tabs",
    icon: CreditCard,
    subs: [
      "Loan EMI",
      "Credit Card Bills",
      "Shared Bills (Friends)",
      "Family Support",
      "Money Owed to Others",
    ],
  },
  {
    name: "Social & Celebrations",
    icon: PartyPopper,
    subs: [
      "Marriage Functions",
      "Birthday Parties",
      "Friend Meetups",
      "Gifts",
      "Donations",
      "Festival Celebrations",
    ],
  },
  {
    name: "Subscriptions & Memberships",
    icon: Receipt,
    subs: [
      "Software / Tools",
      "Cloud Storage",
      "Music / Streaming",
      "News / Publications",
      "Professional Memberships",
      "Club Memberships",
    ],
  },
];

export function findGroupForSub(sub: string): ExpenseCategoryGroup | undefined {
  return EXPENSE_CATEGORY_GROUPS.find((g) => g.subs.includes(sub));
}

// ---- Custom subcategories (tenant_settings since Stage 3.1) -----------------
type CustomSubs = CustomSubcategories;

/**
 * Per-head-category custom subcategories. Lets users add their own sub under any
 * group (e.g. a "Parking" sub under Travel & Transport).
 *
 * Stage 3.1 moved these off localStorage (`expense.custom-subcategories.v1`) and
 * into `tenant_settings`, for the same reason as custom categories: they name
 * values written into shared transactions, so a per-device copy meant one
 * member's rows looked mislabelled to everyone else. The old cross-tab
 * "custom-subs" event is gone — React Query's cache is now the sync mechanism.
 */
export function useCustomSubcategories() {
  const { value: store, setValue: persist } = useTenantSetting("custom_subcategories");

  const add = useCallback(
    (group: string, sub: string) => {
      const name = sub.trim();
      if (!name) return false;
      const existing = store[group] ?? [];
      const builtIn = EXPENSE_CATEGORY_GROUPS.find((g) => g.name === group)?.subs ?? [];
      // Avoid duplicates (case-insensitive) against built-in + existing custom.
      const all = [...builtIn, ...existing].map((s) => s.toLowerCase());
      if (all.includes(name.toLowerCase())) return false;
      persist({ ...store, [group]: [...existing, name] });
      return true;
    },
    [store, persist],
  );

  const remove = useCallback(
    (group: string, sub: string) => {
      const existing = store[group] ?? [];
      persist({ ...store, [group]: existing.filter((s) => s !== sub) });
    },
    [store, persist],
  );

  const forGroup = useCallback((group: string) => store[group] ?? [], [store]);

  return { store, add, remove, forGroup };
}
