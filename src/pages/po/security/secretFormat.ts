/**
 * The PO secret's two primitives — split out of PoSecurity.tsx in Stage 4.13
 * so the page, the password section and the identifiers section can share them.
 */

/**
 * A 16-digit secret from `crypto.getRandomValues` — never `Math.random`: this
 * is a credential for the Product Owner console, and a predictable one is the
 * same as no secret at all. Two 32-bit draws are taken modulo 1e8 and padded,
 * so every position keeps a leading zero rather than shortening the string.
 */
export function generateSecret(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const a = String(buf[0] % 100_000_000).padStart(8, "0");
  const b = String(buf[1] % 100_000_000).padStart(8, "0");
  return a + b;
}

/** "1234567890123456" → "1234 5678 9012 3456" */
export function fmt(raw: string) {
  return raw.replace(/(\d{4})(?=\d)/g, "$1 ");
}
