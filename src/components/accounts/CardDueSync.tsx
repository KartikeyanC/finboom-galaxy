import { useEffect, useRef } from "react";
import { useAccounts } from "@/lib/accountsStore";
import { useReminders } from "@/lib/remindersStore";
import { useTenantSetting } from "@/hooks/useTenantSetting";
import { useTenant } from "@/contexts/TenantContext";
import { planCardReminders } from "@/lib/cardDue";

/**
 * Keeps each credit card's monthly payment-due reminder in step with its due
 * day (cardDue.ts): makes it, moves it to the next due date once the month's
 * is past or marked done, and removes it when the day is cleared or the card
 * deleted. Rendered once inside the signed-in app; draws nothing.
 *
 * It waits until accounts, reminders and the setting have all really arrived
 * (`loaded`, not merely "not loading" — a failed or disabled query is also not
 * loading): a plan made from a list that never came would read "no cards"
 * and remove every card reminder.
 */
export function CardDueSync() {
  const { currentTenantId } = useTenant();
  const { accounts, loaded: accountsLoaded } = useAccounts();
  const { records, upsert, remove, loaded: remindersLoaded } = useReminders();
  const { value: dues, loaded: duesLoaded } = useTenantSetting("card_due_days");
  const running = useRef(false);

  useEffect(() => {
    if (!currentTenantId || !accountsLoaded || !remindersLoaded || !duesLoaded) return;
    if (running.current) return;
    const { upserts, removes } = planCardReminders({
      accounts,
      dues,
      reminders: records,
      tenantId: currentTenantId,
      today: new Date(),
    });
    if (upserts.length === 0 && removes.length === 0) return;
    running.current = true;
    void (async () => {
      try {
        for (const r of upserts) await upsert(r);
        for (const id of removes) await remove(id);
      } finally {
        running.current = false;
      }
    })();
  }, [
    currentTenantId,
    accounts,
    dues,
    records,
    accountsLoaded,
    remindersLoaded,
    duesLoaded,
    upsert,
    remove,
  ]);

  return null;
}
