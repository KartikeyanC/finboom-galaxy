/**
 * Stage 3.1 — the registry of per-workspace settings that live in
 * `public.tenant_settings`.
 *
 * The table constrains the key's *shape* (`^[a-z][a-z0-9_]*$`) but not its
 * spelling, on purpose: an enum in SQL would mean a migration for every new
 * setting. This file is the spelling authority instead, and
 * `tenantSettings.test.ts` asserts no call site invents a key that isn't here —
 * a typo would otherwise create a second, silently-empty setting that reads as
 * "the user has no custom categories".
 *
 * Each entry carries its `defaultValue` and the localStorage key it replaced,
 * so the one-time import in `useTenantSetting` has a single source to work from
 * rather than five hand-written migrations.
 */

import { DEFAULT_ONBOARDING, type OnboardingState } from "@/lib/onboarding";

export type CustomCategories = {
  income: { active: string[]; passive: string[] };
  expense: string[];
};

export type CustomSubcategories = Record<string, string[]>;

export type BudgetPlannerState = {
  income: number;
  needs: number;
  wants: number;
  savings: number;
};

export type TenantSettingsMap = {
  custom_categories: CustomCategories;
  custom_subcategories: CustomSubcategories;
  budget_planner: BudgetPlannerState;
  base_currency: string;
  onboarding: OnboardingState;
};

export type TenantSettingKey = keyof TenantSettingsMap;

/**
 * `legacyKey` is the exact localStorage key each setting used before 3.1.
 * None of them were namespaced by tenant or user, which is why two accounts
 * sharing a browser profile saw each other's categories (BUG-026/071).
 *
 * It is OPTIONAL because a setting written after 3.1 never had a localStorage
 * predecessor to import (`onboarding`, Stage 5.3). Omitting it is the signal to
 * `useTenantSetting` that there is nothing to import — an invented key would
 * make the importer read a slot nothing has ever written.
 */
export const TENANT_SETTINGS: {
  [K in TenantSettingKey]: { defaultValue: TenantSettingsMap[K]; legacyKey?: string };
} = {
  custom_categories: {
    defaultValue: { income: { active: [], passive: [] }, expense: [] },
    legacyKey: "custom-categories-v1",
  },
  custom_subcategories: {
    defaultValue: {},
    legacyKey: "expense.custom-subcategories.v1",
  },
  budget_planner: {
    defaultValue: { income: 0, needs: 50, wants: 30, savings: 20 },
    legacyKey: "budgetAllocator.v1",
  },
  base_currency: {
    defaultValue: "INR",
    legacyKey: "finroot.baseCurrency",
  },
  // Stage 5.3. Tenant-scoped rather than per-user because the thing it tracks
  // is the WORKSPACE's setup: an invited collaborator should not be walked
  // through creating a first transaction in a workspace that already has 400.
  onboarding: {
    defaultValue: DEFAULT_ONBOARDING,
  },
};

export const TENANT_SETTING_KEYS = Object.keys(TENANT_SETTINGS) as TenantSettingKey[];

/** Matches the `tenant_settings_key_format` CHECK, so the client rejects first. */
export const TENANT_SETTING_KEY_FORMAT = /^[a-z][a-z0-9_]*$/;

export function isTenantSettingKey(key: string): key is TenantSettingKey {
  return Object.prototype.hasOwnProperty.call(TENANT_SETTINGS, key);
}

/**
 * The flag marking a workspace's one-time localStorage import as done.
 *
 * Same idiom AND same prefix as the Phase-2 store migrations
 * (`finroot.migrated.<store>.<tenant>`) — note the singular `finroot.`:
 * `appLock.ts` performs a one-time rename of any `finroots.*` key to
 * `finroot.*`, so the plural form would live in a namespace another routine
 * rewrites out from under it.
 *
 * Per tenant, because importing this device's values into a second workspace
 * would copy one workspace's categories into another.
 */
export function importedFlagKey(key: TenantSettingKey, tenantId: string): string {
  return `finroot.migrated.setting.${key}.${tenantId}`;
}
