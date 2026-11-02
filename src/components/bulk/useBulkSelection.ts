import { useCallback, useMemo, useState } from "react";

/**
 * The selection behind a bulk delete — see BulkSelect.tsx for the pattern.
 * Kept apart from the components so fast refresh keeps working.
 */
export type BulkSelection = {
  /** Ticked ids that are still in the list. */
  ids: string[];
  count: number;
  all: boolean;
  some: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
};

export function useBulkSelection(visibleIds: readonly string[]): BulkSelection {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const ids = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);
  const count = ids.length;

  const toggle = useCallback(
    (id: string) =>
      setPicked((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const setAll = useCallback(
    (on: boolean) =>
      setPicked((s) => {
        const next = new Set(s);
        visibleIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
        return next;
      }),
    [visibleIds],
  );
  const clear = useCallback(() => setPicked(new Set()), []);

  return {
    ids,
    count,
    all: visibleIds.length > 0 && count === visibleIds.length,
    some: count > 0,
    isSelected: (id) => picked.has(id),
    toggle,
    setAll,
    clear,
  };
}

/**
 * Deletes one at a time with [del] (for stores that have no batch delete),
 * and says how many failed — what [BulkDeleteBar]'s onDelete returns.
 */
export async function deleteEach(
  ids: string[],
  del: (id: string) => unknown | Promise<unknown>,
): Promise<number> {
  let failed = 0;
  for (const id of ids) {
    try {
      await del(id);
    } catch {
      failed++;
    }
  }
  return failed;
}
