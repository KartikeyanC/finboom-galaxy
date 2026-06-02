export interface ExpenseCategoryGroup {
  name: string;
  icon: string;
  subs: string[];
}

export const EXPENSE_CATEGORY_GROUPS: ExpenseCategoryGroup[] = [
  {
    name: "Food & Dining",
    icon: "🍽️",
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
    icon: "🚗",
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
    icon: "🎬",
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
    icon: "🏠",
    subs: ["Rent", "Electricity", "Water", "Internet", "Gas", "Home Maintenance", "Furniture"],
  },
  {
    name: "Healthcare & Wellness",
    icon: "🩺",
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
    icon: "🛍️",
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
    icon: "📚",
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
    icon: "💳",
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
    icon: "🎉",
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
    icon: "🧾",
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