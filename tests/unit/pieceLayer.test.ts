import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { tileKey } from '../../spacetimedb/src/logic/grid';
import type { Piece } from '../../src/module_bindings/types';
import { PieceLayer } from '../../src/scene/pieces';

// The glow sprites draw a canvas texture, which Node has no DOM for.
vi.mock('../../src/scene/glow', () => ({
  createLampGlow: () => new THREE.Sprite(),
  createFireflies: () => new THREE.Group(),
  setNightLevel: () => {},
}));

function row(id: bigint, kind: string, tileX = 3, tileZ = 4): Piece {
  return { id, kind, tileX, tileZ, tileKey: tileKey(tileX, tileZ) } as Piece;
}

describe('piece layer', () => {
  it('keeps a replacement piece when the old row is deleted after it arrives', () => {
    // Loading a build replaces pieces in one transaction; the client may see the
    // new row's insert before the old row's delete.
    const scene = new THREE.Scene();
    const layer = new PieceLayer(scene);
    layer.upsert(row(1n, 'rock'));
    layer.upsert(row(2n, 'tree'));
    layer.remove(row(1n, 'rock'));
    expect(scene.children).toHaveLength(1);

    layer.remove(row(2n, 'tree'));
    expect(scene.children).toHaveLength(0);
  });
});
