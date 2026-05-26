## Income & Customization Module — Valar Finance Tracker

Build an interactive Income module on `/app/income` with reorderable, hide/show-able category cards, currency-aware INR conversion, and an inline quick-add card. State is local (mocked) for now, with a schema shape ready to sync to the backend later.

### 1. Data model (local state)

A single `incomeStreams` array, typed:

```ts
type IncomeStream = {
  id: string;
  name: string;          // "Salary", "Rent", custom tag, etc.
  type: "active" | "passive";
  icon: string;          // lucide icon name
  amount: number;
  currency: "USD" | "EUR" | "INR";
  exchangeRateToINR: number;
  isVisible: boolean;
  displayOrder: number;
};
```

Seeded with: Salary (active) + Rent, Dividend, Course, YouTube, Sponsorship, College, Interview, Editing, Digital Art, Interest, Business, Bonus, Tax Refund, Self Transfer (passive). Persisted to `localStorage` under `valar.income.streams` so refreshes keep state.

### 2. UI layout (replaces current `src/pages/Income.tsx` body)

Keep the existing header + 4 metric cards (recomputed from visible streams, INR equivalents). Below them:

```text
+--------------------------------------------------+
| Income Streams              [⚙ Manage Categories]|
+--------------------------------------------------+
| ⋮⋮  [icon]  Salary                               |
|             $5,000 USD  →  ₹4,16,000             |
+--------------------------------------------------+
| ⋮⋮  [icon]  Rent                                 |
|             ₹25,000 INR →  ₹25,000               |
+--------------------------------------------------+
| ...                                              |
+--------------------------------------------------+
| +  Add custom income stream                      |
+--------------------------------------------------+
```

Cards: rounded, high-contrast, generous whitespace, hover lift, fade-in on mount. Responsive single column on mobile (375px+), comfortable max-width on desktop.

### 3. Drag-and-drop reordering

- Left-side grip handle (`GripVertical` icon) on each card.
- Use HTML5 drag-and-drop (no new dependency) on the handle; on drop, recompute `displayOrder` for all visible cards and animate position change with a CSS transition (`transition-all duration-300`).
- Touch-friendly fallback: small up/down chevron buttons appear on the handle for mobile.

### 4. Manage Categories overlay

- Gear button top-right of the section opens a Sheet/Dialog (shadcn `Sheet`).
- Lists every stream (active + passive) with a `Switch` bound to `isVisible`.
- Toggling instantly hides/shows the matching card in the main list, with a fade + height-collapse transition.

### 5. Inline quick-add card

- A "+ Add custom income stream" card sits at the bottom of the visible list.
- Click expands it inline (height/opacity animation) with fields:
  - Amount (number)
  - Currency dropdown (USD / EUR / INR)
  - Exchange rate to INR (auto-filled with sensible default per currency; editable; locked to 1 for INR)
  - Category name (text)
- Save appends a new stream with the next `displayOrder`, `isVisible: true`, type `"passive"`. Cancel collapses without saving.

### 6. Files

- Edit `src/pages/Income.tsx` — orchestrates state, metrics, list.
- New `src/components/income/IncomeCard.tsx` — single card with handle, icon, amount, INR conversion.
- New `src/components/income/ManageCategoriesSheet.tsx` — overlay with toggles.
- New `src/components/income/QuickAddCard.tsx` — inline add form.
- New `src/hooks/useIncomeStreams.ts` — state, localStorage sync, reorder/toggle/add helpers.
- New `src/lib/incomeSeed.ts` — default categories + icon map.

### 7. Backend-ready schema (not built now)

Documented in code comments so a future migration is one-to-one:

```text
income_streams(
  id uuid pk, user_id uuid, name text, type text,
  icon text, amount numeric, currency text,
  exchange_rate_to_inr numeric, is_visible boolean,
  display_order int, created_at, updated_at
)
```

No DB changes in this step — module is fully interactive on local state. Wiring to Supabase happens in a follow-up once you approve the UX.

### Out of scope for this step

- Persisting to the backend / RLS migration.
- Editing existing card amounts (only add + hide + reorder for now — can add inline edit next round if you want).
- Live FX rates (rates are user-entered; defaults provided).
