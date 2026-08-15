import { supabase } from "@/integrations/supabase/client";

import { LEGAL_VERSION } from "./legal";

/**
 * Stage 5.1 — record that this account accepted the current terms.
 *
 * Deliberately fire-and-forget. The CONSENT is the notice shown next to the
 * sign-up button; this call is the evidence of it. If the write fails, the
 * user has still agreed and must still get their account — failing sign-up
 * because an audit row could not be written would be the wrong trade.
 */
export function recordLegalAcceptance(): void {
  void supabase.rpc("record_legal_acceptance", { p_version: LEGAL_VERSION })
    .then(({ error }) => {
      if (error) {
        console.warn("[legal] acceptance not recorded:", error.message);
      }
    });
}
