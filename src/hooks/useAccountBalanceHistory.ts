import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export interface BalanceSnapshot {
  id: string;
  user_id: string;
  account_local_id: string;
  account_name: string;
  old_balance: number;
  new_balance: number;
  note: string | null;
  created_at: string;
}

function storageKey(userId: string) {
  return `finroot.balance_history.${userId}`;
}

function readAll(userId: string): BalanceSnapshot[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as BalanceSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, snapshots: BalanceSnapshot[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(snapshots));
}

// Fetch all snapshots for one account
export function useAccountBalanceHistory(accountLocalId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["account_balance_history", accountLocalId, user?.id],
    enabled: !!user && !!accountLocalId,
    queryFn: () => {
      const all = readAll(user!.id);
      return all
        .filter((s) => s.account_local_id === accountLocalId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    },
  });
}

// Save a new balance snapshot
export function useSaveBalanceSnapshot() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      account_local_id: string;
      account_name: string;
      old_balance: number;
      new_balance: number;
      note?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const snapshot: BalanceSnapshot = {
        id: crypto.randomUUID(),
        user_id: user.id,
        account_local_id: payload.account_local_id,
        account_name: payload.account_name,
        old_balance: payload.old_balance,
        new_balance: payload.new_balance,
        note: payload.note ?? null,
        created_at: new Date().toISOString(),
      };
      const all = readAll(user.id);
      writeAll(user.id, [snapshot, ...all]);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["account_balance_history", vars.account_local_id],
      });
    },
  });
}
