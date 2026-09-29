import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  challengeById,
} from '../../spacetimedb/src/logic/challenges';
import {
  DEFAULT_TIMING,
  isValidTiming,
} from '../../spacetimedb/src/logic/phases';
import { isPieceKind } from '../../spacetimedb/src/logic/pieces';
import {
  COMBOS,
  pointsToNextStar,
  scoreBoard,
  starsFor,
  type BoardPiece,
} from '../../spacetimedb/src/logic/scoring';

const at = (kind: string, tileX: number, tileZ: number): BoardPiece => ({
  kind,
  tileX,
  tileZ,
});

describe('co-op themes', () => {
  it('has four themes with a title and a blurb, and no checklist', () => {
    expect(CHALLENGES).toHaveLength(4);
    CHALLENGES.forEach((c, i) => {
      expect(c.id).toBe(i);
      expect(c.title).toBeTruthy();
      expect(c.blurb).toBeTruthy();
      expect(Object.keys(c).sort()).toEqual(['blurb', 'id', 'title']);
    });
  });

  it('falls back to the first theme for unknown ids', () => {
    expect(challengeById(99).id).toBe(0);
  });
});

describe('combo catalog', () => {
  it('uses real piece kinds, with one combo per kind', () => {
    for (const combo of COMBOS) {
      expect(isPieceKind(combo.kind)).toBe(true);
      expect(combo.partners.every(isPieceKind)).toBe(true);
    }
    const kinds = COMBOS.map((c) => c.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('scoreBoard', () => {
  it('scores one point per piece', () => {
    expect(scoreBoard([]).score).toBe(0);
    const board = [at('house', 0, 0), at('rock', 5, 5), at('tree', 9, 9)];
    expect(scoreBoard(board)).toEqual({ score: 3, combos: [], stars: 0 });
  });

  // Every combo, with every partner: the piece doubles (2) and its partner adds 1.
  for (const combo of COMBOS) {
    for (const partner of combo.partners) {
      it(`doubles ${combo.label} (${combo.kind} with ${partner})`, () => {
        const partnerAt =
          combo.where === 'under' ? at(partner, 4, 4) : at(partner, 5, 4);
        const result = scoreBoard([at(combo.kind, 4, 4), partnerAt]);
        expect(result.score).toBe(3);
        expect(result.combos).toEqual([{ label: combo.label, count: 1 }]);
      });
    }
  }

  it('needs a side neighbour: diagonal or distant partners do not count', () => {
    expect(scoreBoard([at('lamp', 4, 4), at('path', 5, 5)]).score).toBe(2);
    expect(scoreBoard([at('lamp', 4, 4), at('path', 6, 4)]).score).toBe(2);
  });

  it('counts fireflies only over their partner, not beside it', () => {
    expect(scoreBoard([at('fireflies', 4, 4), at('tree', 5, 4)]).score).toBe(2);
    expect(scoreBoard([at('fireflies', 4, 4), at('house', 4, 4)]).score).toBe(
      2,
    );
  });

  it('doubles a piece once, however many partners it has', () => {
    const board = [
      at('lamp', 4, 4),
      at('path', 3, 4),
      at('path', 5, 4),
      at('tile', 4, 5),
    ];
    expect(scoreBoard(board).score).toBe(2 + 3);
  });

  it('lists combos most first', () => {
    const board = [
      at('bridge', 0, 0),
      at('water', 1, 0),
      at('lamp', 5, 5),
      at('path', 6, 5),
      at('lamp', 7, 5),
    ];
    expect(scoreBoard(board).combos).toEqual([
      { label: 'Lamp by a path', count: 2 },
      { label: 'Bridge by water', count: 1 },
    ]);
  });
});

describe('stars', () => {
  it('awards a star at 25, 50, and 100 points', () => {
    expect(starsFor(24)).toBe(0);
    expect(starsFor(25)).toBe(1);
    expect(starsFor(50)).toBe(2);
    expect(starsFor(99)).toBe(2);
    expect(starsFor(100)).toBe(3);
  });

  it('counts the points to the next star', () => {
    expect(pointsToNextStar(0)).toBe(25);
    expect(pointsToNextStar(30)).toBe(20);
    expect(pointsToNextStar(100)).toBeNull();
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
});
