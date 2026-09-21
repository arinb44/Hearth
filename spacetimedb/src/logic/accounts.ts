// Account rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

export interface Username {
  /** As typed (trimmed), shown to other players. */
  display: string;
  /** Lowercase form; unique, so "Ada" and "ada" can't both exist. */
  key: string;
}

/** Letters, digits, spaces, underscores and dashes; null if invalid. */
export function parseUsername(raw: string): Username | null {
  const display = raw.replace(/\s+/g, ' ').trim();
  if (display.length < USERNAME_MIN || display.length > USERNAME_MAX)
    return null;
  if (!/^[\p{L}\p{N} _-]+$/u.test(display)) return null;
  return { display, key: display.toLowerCase() };
}

/** Crockford base32: no I, L, O, or U, so codes are easy to read aloud and retype. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 12;

/** Builds a code from CODE_LENGTH random digits in [0, 32). */
export function codeFromDigits(digits: number[]): string {
  return digits.map((d) => CODE_ALPHABET[d]).join('');
}

/** Groups a stored code as XXXX-XXXX-XXXX for display. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)!.join('-');
}

/**
 * Normalizes what a player typed: uppercase, drops spaces and dashes, and reads
 * look-alikes the Crockford way (O → 0, I/L → 1). Null if it can't be a code.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}
