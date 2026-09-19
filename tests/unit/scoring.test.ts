import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  challengeById,
} from '../../spacetimedb/src/logic/challenges';
import {
  DEFAULT_TIMING,
  isValidTiming,
  remainingFraction,
  secondsToMicros,
} from '../../spacetimedb/src/logic/phases';
import { isPieceKind } from '../../spacetimedb/src/logic/pieces';
import {
  evaluateChallenge,
  scoreRound,
  starsFor,
  type BoardPiece,
} from '../../spacetimedb/src/logic/scoring';

const village = challengeById(0);
const at = (kind: string, tileX: number, tileZ: number): BoardPiece => ({
  kind,
  tileX,
  tileZ,
});

/** A board that completes Cozy Village: a row of paths with houses above it. */
function finishedVillage(): BoardPiece[] {
  const paths = [0, 1, 2, 3, 4, 5].map((x) => at('path', x, 0));
  const houses = [0, 1, 2, 3].map((x) => at('house', x, 1));
  return [...paths, ...houses, at('well', 5, 1)];
}

describe('challenge catalog', () => {
  it('has four challenges whose targets use real piece kinds', () => {
    expect(CHALLENGES).toHaveLength(4);
    CHALLENGES.forEach((c, i) => {
      expect(c.id).toBe(i);
      for (const t of c.targets) {
        const kinds = t.type === 'count' ? t.kinds : [t.kind, ...t.to];
        expect(kinds.every(isPieceKind)).toBe(true);
      }
    });
  });

  it('falls back to the first challenge for unknown ids', () => {
    expect(challengeById(99).id).toBe(0);
  });
});

describe('evaluateChallenge', () => {
  it('reports zero progress on an empty board', () => {
    const result = evaluateChallenge(village, []);
    expect(result.complete).toBe(false);
    expect(result.completion).toBe(0);
    expect(result.targets.map((t) => t.value)).toEqual([0, 0, 0, 0]);
  });

  it('gives partial credit for count targets, capped at the goal', () => {
    const result = evaluateChallenge(village, [
      at('house', 0, 0),
      at('house', 5, 5),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((x) => at('path', x, 10)),
    ]);
    expect(result.targets[0]).toMatchObject({
      value: 2,
      goal: 4,
      done: false,
      completion: 0.5,
    });
    expect(result.targets[1]).toMatchObject({
      value: 8,
      goal: 6,
      done: true,
      completion: 1,
    });
  });

  it('checks adjacency with the four neighbours only', () => {
    const result = evaluateChallenge(village, [
      at('house', 5, 5),
      at('path', 6, 5), // beside: counts
      at('house', 10, 10),
      at('path', 11, 11), // diagonal: does not count
    ]);
    expect(result.targets[3]).toMatchObject({ value: 1, goal: 2, done: false });
  });

  it('completes when every target is met', () => {
    const result = evaluateChallenge(village, finishedVillage());
    expect(result.complete).toBe(true);
    expect(result.completion).toBe(1);
  });

  it('counts any of several kinds for a mixed target', () => {
    const camp = challengeById(1);
    const trees = [0, 1, 2, 3].map((x) => at('tree', x, 0));
    const pines = [0, 1, 2, 3].map((x) => at('pine', x, 1));
    expect(evaluateChallenge(camp, [...trees, ...pines]).targets[0].done).toBe(
      true,
    );
  });
});

describe('scoreRound and stars', () => {
  it('scores completion, plus a time bonus only when complete', () => {
    const partial = evaluateChallenge(village, [at('house', 0, 0)]);
    expect(scoreRound(partial, 0.9)).toBe(Math.round(partial.completion * 100));

    const done = evaluateChallenge(village, finishedVillage());
    expect(scoreRound(done, 0)).toBe(100);
    expect(scoreRound(done, 0.5)).toBe(125);
    expect(scoreRound(done, 1)).toBe(150);
  });

  it('awards stars by score', () => {
    expect(starsFor(10)).toBe(0);
    expect(starsFor(60)).toBe(1);
    expect(starsFor(100)).toBe(2);
    expect(starsFor(130)).toBe(3);
  });
});

describe('round timing', () => {
  it('accepts the defaults and rejects zero or huge phases', () => {
    expect(isValidTiming(DEFAULT_TIMING)).toBe(true);
    expect(isValidTiming({ ...DEFAULT_TIMING, lobbySeconds: 0 })).toBe(true);
    expect(isValidTiming({ ...DEFAULT_TIMING, buildSeconds: 0 })).toBe(false);
    expect(isValidTiming({ ...DEFAULT_TIMING, resultsSeconds: 10_000 })).toBe(
      false,
    );
  });

  it('computes the remaining fraction of a phase', () => {
    const start = 1_000_000_000n;
    const end = start + secondsToMicros(120);
    expect(remainingFraction(end, start, 120)).toBe(1);
    expect(
      remainingFraction(end, start + secondsToMicros(90), 120),
    ).toBeCloseTo(0.25);
    expect(remainingFraction(end, end + 5n, 120)).toBe(0);
  });
});
