import { describe, expect, it } from 'vitest';
import { GRID_SIZE, tileToWorld } from '../../spacetimedb/src/logic/grid';
import {
  BUILD_ERROR_MESSAGES,
  BUILD_REACH,
  canBuildInPhase,
  checkModify,
  checkPlacement,
  GROUND,
  isBuilding,
  isPieceKind,
  layerOf,
  modifyTarget,
  OVERLAY,
  PIECE_CATEGORIES,
  PIECE_KINDS,
  PIECE_LABELS,
  SERVER_REACH_SLACK,
  withinReach,
} from '../../spacetimedb/src/logic/pieces';

const center = { x: 12, z: 12 };
const standingOnCenter = { x: tileToWorld(12), z: tileToWorld(12) };
const okPlacement = {
  kind: 'house',
  rotation: 0,
  tile: center,
  phase: 'Building',
  contents: {},
  playerPos: standingOnCenter,
};

describe('catalog', () => {
  it('labels every kind and recognises only catalog kinds', () => {
    for (const kind of PIECE_KINDS) {
      expect(PIECE_LABELS[kind]).toBeTruthy();
      expect(isPieceKind(kind)).toBe(true);
    }
    expect(isPieceKind('castle')).toBe(false);
  });

  it('puts every kind in exactly one palette category', () => {
    const grouped = PIECE_CATEGORIES.flatMap((c) => c.kinds);
    expect([...grouped].sort()).toEqual([...PIECE_KINDS].sort());
    expect(PIECE_CATEGORIES.map((c) => c.name)).toEqual([
      'Buildings',
      'Greenery',
      'Furniture',
      'Environment',
    ]);
  });

  it('keeps the original ten kinds first, so their hotkeys never change', () => {
    expect(PIECE_KINDS.slice(0, 10)).toEqual([
      'house',
      'tree',
      'pine',
      'rock',
      'path',
      'flowers',
      'fence',
      'well',
      'lamp',
      'tower',
    ]);
  });

  it('has a message for every error', () => {
    for (const message of Object.values(BUILD_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe('checkPlacement', () => {
  it('accepts a valid placement', () => {
    expect(checkPlacement(okPlacement)).toBeNull();
  });

  it('rejects unknown kinds and bad rotations', () => {
    expect(checkPlacement({ ...okPlacement, kind: 'castle' })).toBe(
      'unknown_kind',
    );
    expect(checkPlacement({ ...okPlacement, rotation: 4 })).toBe(
      'bad_rotation',
    );
    expect(checkPlacement({ ...okPlacement, rotation: 1.5 })).toBe(
      'bad_rotation',
    );
  });

  it('rejects tiles off the grid', () => {
    expect(
      checkPlacement({ ...okPlacement, tile: { x: GRID_SIZE, z: 0 } }),
    ).toBe('out_of_bounds');
  });

  it('rejects occupied tiles', () => {
    expect(
      checkPlacement({ ...okPlacement, contents: { ground: 'tree' } }),
    ).toBe('occupied');
  });

  it('only allows building in the Lobby and Building phases', () => {
    expect(canBuildInPhase('Lobby')).toBe(true);
    expect(canBuildInPhase('Building')).toBe(true);
    expect(checkPlacement({ ...okPlacement, phase: 'Scoring' })).toBe(
      'wrong_phase',
    );
    expect(checkPlacement({ ...okPlacement, phase: 'Results' })).toBe(
      'wrong_phase',
    );
  });

  it('requires the player to be within reach', () => {
    const far = {
      x: standingOnCenter.x + BUILD_REACH + 0.5,
      z: standingOnCenter.z,
    };
    expect(checkPlacement({ ...okPlacement, playerPos: far })).toBe(
      'out_of_reach',
    );
    expect(
      checkPlacement({
        ...okPlacement,
        playerPos: far,
        reachSlack: SERVER_REACH_SLACK,
      }),
    ).toBeNull();
  });
});

describe('checkModify', () => {
  const okModify = {
    tile: center,
    phase: 'Lobby',
    contents: { ground: 'tree' },
    playerPos: standingOnCenter,
  };

  it('accepts changing an existing piece in reach', () => {
    expect(checkModify(okModify)).toBeNull();
  });

  it('rejects empty tiles, wrong phase, and distant tiles', () => {
    expect(checkModify({ ...okModify, contents: {} })).toBe('empty');
    expect(checkModify({ ...okModify, phase: 'Results' })).toBe('wrong_phase');
    expect(checkModify({ ...okModify, playerPos: { x: 100, z: 100 } })).toBe(
      'out_of_reach',
    );
  });
});

describe('stacking', () => {
  const fireflies = { ...okPlacement, kind: 'fireflies' };

  it('puts fireflies on their own layer and everything else on the ground', () => {
    expect(layerOf('fireflies')).toBe(OVERLAY);
    expect(layerOf('tree')).toBe(GROUND);
    expect(layerOf('wall')).toBe(GROUND);
    expect(['house', 'tower', 'wall', 'well', 'bridge'].every(isBuilding)).toBe(
      true,
    );
    expect(isBuilding('tree')).toBe(false);
  });

  it('lets fireflies float over any piece but a building', () => {
    for (const ground of [
      'tree',
      'pine',
      'flowers',
      'grass',
      'path',
      'water',
    ]) {
      expect(checkPlacement({ ...fireflies, contents: { ground } })).toBeNull();
    }
    for (const ground of ['house', 'tower', 'wall', 'well', 'bridge']) {
      expect(checkPlacement({ ...fireflies, contents: { ground } })).toBe(
        'cannot_stack',
      );
    }
    expect(
      checkPlacement({
        ...fireflies,
        contents: { ground: 'tree', overlay: 'fireflies' },
      }),
    ).toBe('occupied');
  });

  it('lets ground pieces, but not buildings, go under fireflies', () => {
    const under = { overlay: 'fireflies' };
    expect(
      checkPlacement({ ...okPlacement, kind: 'tree', contents: under }),
    ).toBeNull();
    expect(checkPlacement({ ...okPlacement, contents: under })).toBe(
      'cannot_stack',
    );
  });

  it('rotates the ground piece and removes the top piece first', () => {
    const both = { ground: 'tree', overlay: 'fireflies' };
    expect(modifyTarget(both, 'rotate')).toBe(GROUND);
    expect(modifyTarget(both, 'remove')).toBe(OVERLAY);
    expect(modifyTarget({ overlay: 'fireflies' }, 'rotate')).toBe(OVERLAY);
    expect(modifyTarget({ ground: 'tree' }, 'remove')).toBe(GROUND);
    expect(modifyTarget({}, 'remove')).toBeNull();
  });
});

describe('withinReach', () => {
  it('measures from the player to the tile center', () => {
    expect(withinReach(standingOnCenter, center)).toBe(true);
    expect(
      withinReach(
        { x: standingOnCenter.x + BUILD_REACH, z: standingOnCenter.z },
        center,
      ),
    ).toBe(true);
    expect(
      withinReach(
        { x: standingOnCenter.x + BUILD_REACH + 0.01, z: standingOnCenter.z },
        center,
      ),
    ).toBe(false);
  });
});
