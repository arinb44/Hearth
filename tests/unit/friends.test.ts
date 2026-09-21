import { describe, expect, it } from 'vitest';
import {
  friendPairKey,
  otherAccount,
} from '../../spacetimedb/src/logic/friends';

describe('friend pairs', () => {
  it('gives both directions of a pair the same key', () => {
    expect(friendPairKey(3n, 7n)).toBe(friendPairKey(7n, 3n));
  });

  it('gives different pairs different keys', () => {
    const keys = [
      friendPairKey(1n, 2n),
      friendPairKey(1n, 3n),
      friendPairKey(2n, 3n),
      friendPairKey(12n, 3n),
      friendPairKey(1n, 23n),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('finds the other account from either side', () => {
    const pair = { accountA: 4n, accountB: 9n };
    expect(otherAccount(pair, 4n)).toBe(9n);
    expect(otherAccount(pair, 9n)).toBe(4n);
  });
});
