/**
 * Shared by the four import preview tables (Stage 4.13).
 *
 * A parsed cell that was blank or unparseable arrives as NaN, and `NaN` renders
 * as "₹NaN" and poisons every running total it touches. Every amount shown in a
 * validation queue goes through this first — the row is still visible and still
 * editable, it just reads as 0 until the user fixes it.
 */
export const safe = (n: number) => (Number.isFinite(n) ? n : 0);
