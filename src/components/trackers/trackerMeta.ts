import {
  Home,
  Plane,
  Heart,
  Car,
  GraduationCap,
  Briefcase,
  PartyPopper,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import type { TrackerType } from "@/lib/trackers";

/**
 * The vocabulary of tracker types, as UI.
 *
 * Mirrors `src/pages/trips/tripMeta.ts` in shape and intent: one place that
 * decides what each kind of thing is called, what it looks like, and what a
 * sensible starting point is — so a dialog can be a dialog rather than a
 * catalogue of special cases.
 *
 * `blurb` is what makes the picker a TEMPLATE chooser rather than an enum
 * dropdown: eight labelled cards with an example each is a recognition task,
 * where a bare select is a recall one (Hick's Law, and Jakob's — this is the
 * same shape as the trip-kind picker the user has already met).
 */
export interface TrackerTypeMeta {
  type: TrackerType;
  icon: LucideIcon;
  /** Placeholder, not a default — the user names their own project. */
  placeholder: string;
  blurb: string;
}

export const TRACKER_TYPE_META: readonly TrackerTypeMeta[] = [
  {
    type: "Home Construction",
    icon: Home,
    placeholder: "Home Construction",
    blurb: "A build or renovation — labour, materials, fittings.",
  },
  {
    type: "Travel",
    icon: Plane,
    placeholder: "Dubai Trip",
    blurb: "A journey whose costs you want totalled afterwards.",
  },
  {
    type: "Wedding",
    icon: Heart,
    placeholder: "Wedding",
    blurb: "A wedding and everything that leads up to it.",
  },
  {
    type: "Vehicle",
    icon: Car,
    placeholder: "Car Purchase",
    blurb: "Buying or running a vehicle — EMI, insurance, service.",
  },
  {
    type: "Education",
    icon: GraduationCap,
    placeholder: "College Fees",
    blurb: "Fees, books, coaching and living costs for a course.",
  },
  {
    type: "Business Project",
    icon: Briefcase,
    placeholder: "Shop Fit-out",
    blurb: "A piece of work you want costed on its own.",
  },
  {
    type: "Event",
    icon: PartyPopper,
    placeholder: "Housewarming",
    blurb: "A one-off occasion with costs spread over weeks.",
  },
  {
    type: "Custom",
    icon: FolderKanban,
    placeholder: "My Project",
    blurb: "Anything else you want to group and total.",
  },
];

const BY_TYPE = new Map(TRACKER_TYPE_META.map((m) => [m.type, m]));

/**
 * Metadata for a type, falling back to Custom.
 *
 * The fallback matters: a row written by a newer client with a type this
 * build has never heard of still renders an icon and a name, rather than
 * crashing a list on an unknown key.
 */
export function trackerTypeMeta(type: string): TrackerTypeMeta {
  return BY_TYPE.get(type as TrackerType) ?? BY_TYPE.get("Custom")!;
}
