/**
 * Stage 4.5 — the spacer that stands in for rows scrolled out of view.
 *
 * A `<tr>` rather than a padded container because it has to live inside
 * `<tbody>`, where anything else is invalid markup that browsers hoist out of
 * the table. `aria-hidden` so a screen reader does not announce a blank row.
 *
 * Paired with `useVirtualRows` in `src/hooks/useVirtualRows.ts`.
 */
export function VirtualSpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
    </tr>
  );
}

export default VirtualSpacerRow;
