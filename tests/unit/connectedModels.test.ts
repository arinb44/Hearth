import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createConnectedModel,
  type NeighbourLookup,
} from '../../src/scene/connectedModels';

/** Neighbours given as "dx,dz" → kind. */
const around =
  (kinds: Record<string, string>): NeighbourLookup =>
  (dx, dz) =>
    kinds[`${dx},${dz}`];

/** Where the wall's sections reach: the unit direction of each off-center mesh. */
function sections(model: THREE.Group): string[] {
  return model.children
    .filter((m) => m.position.y < 0.5 && (m.position.x || m.position.z))
    .map((m) => `${Math.sign(m.position.x)},${Math.sign(m.position.z)}`)
    .sort();
}

describe('stone wall', () => {
  it('joins neighbouring walls and towers', () => {
    const model = createConnectedModel(
      'wall',
      around({ '1,0': 'tower', '-1,0': 'wall', '0,1': 'wall' }),
      0,
    );
    expect(sections(model)).toEqual(['-1,0', '0,1', '1,0']);
  });

  it('ignores other buildings, and runs along its rotation when alone', () => {
    const lone = createConnectedModel('wall', around({ '1,0': 'house' }), 1);
    expect(sections(lone)).toEqual(['0,-1', '0,1']);
  });

  it('runs straight through toward a single tower', () => {
    const model = createConnectedModel('wall', around({ '0,-1': 'tower' }), 0);
    expect(sections(model)).toEqual(['0,-1', '0,1']);
  });
});
