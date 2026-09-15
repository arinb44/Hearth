import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  pickColorIndex,
  PLAYER_COLORS,
  sanitizeName,
} from '../../spacetimedb/src/logic/players';

describe('sanitizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });

  it('strips control characters', () => {
    expect(sanitizeName('Bo\u0000b\n')).toBe('Bob');
  });

  it('limits length', () => {
    expect(sanitizeName('x'.repeat(40))).toHaveLength(MAX_NAME_LENGTH);
  });

  it('rejects names with nothing visible', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   \t ')).toBeNull();
  });
});

describe('pickColorIndex', () => {
  it('picks the lowest unused color', () => {
    expect(pickColorIndex([])).toBe(0);
    expect(pickColorIndex([0, 1, 3])).toBe(2);
  });

  it('wraps when every color is taken', () => {
    const all = PLAYER_COLORS.map((_, i) => i);
    const index = pickColorIndex([...all, 0]);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(PLAYER_COLORS.length);
  });

  it('has a distinct color for each of ten players', () => {
    expect(new Set(PLAYER_COLORS).size).toBe(10);
  });
});
