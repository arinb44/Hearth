import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeFromDigits,
  formatRecoveryCode,
  normalizeRecoveryCode,
  parseUsername,
} from '../../spacetimedb/src/logic/accounts';

describe('parseUsername', () => {
  it('keeps the display form and a lowercase key', () => {
    expect(parseUsername('  Ada   Lovelace ')).toEqual({
      display: 'Ada Lovelace',
      key: 'ada lovelace',
    });
  });

  it('allows letters (any language), digits, spaces, underscores, dashes', () => {
    expect(parseUsername('Zoë_99-x')).not.toBeNull();
  });

  it('rejects names that are too short, too long, or have symbols', () => {
    expect(parseUsername('ab')).toBeNull();
    expect(parseUsername('x'.repeat(17))).toBeNull();
    expect(parseUsername('ada!')).toBeNull();
    expect(parseUsername('<script>')).toBeNull();
  });
});

describe('recovery codes', () => {
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => (i * 7) % 32);
  const code = codeFromDigits(digits);

  it('builds 12-character codes from the unambiguous alphabet', () => {
    expect(code).toHaveLength(CODE_LENGTH);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });

  it('formats in groups of four and reads back the same', () => {
    const shown = formatRecoveryCode(code);
    expect(shown).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(normalizeRecoveryCode(shown)).toBe(code);
  });

  it('forgives case, spaces, and look-alike letters', () => {
    expect(normalizeRecoveryCode('abcd efgh jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizeRecoveryCode('O0IL-0000-0000')).toBe('001100000000');
  });

  it('rejects wrong lengths and impossible characters', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH')).toBeNull();
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMU')).toBeNull();
  });
});
