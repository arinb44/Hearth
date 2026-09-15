// Player naming and color rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.

export const MAX_NAME_LENGTH = 16;

/** Ten distinct, friendly colors: one per player at full capacity. */
export const PLAYER_COLORS = [
  0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xff922b, 0x38d9a9,
  0xf783ac, 0x748ffc, 0xa9e34b,
] as const;

/** Trims, collapses whitespace, strips control characters; null if nothing is left. */
export function sanitizeName(raw: string): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return name.length > 0 ? name : null;
}

/** Lowest palette index not used by an online player; wraps if all are taken. */
export function pickColorIndex(used: Iterable<number>): number {
  const taken = new Set(used);
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    if (!taken.has(i)) return i;
  }
  return taken.size % PLAYER_COLORS.length;
}
