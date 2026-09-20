import * as THREE from 'three';
import { BEACH_HALF } from './world';
import { createPieceModel } from './pieceModels';
import { WORLD_LIMIT } from '../../spacetimedb/src/logic/movement';
import type { PieceKind } from '../../spacetimedb/src/logic/pieces';

const PUFF_SECONDS = 0.7;
const SAND_TOP = -0.3;
const PUFF_PARTICLES = 12;

interface Puff {
  group: THREE.Group;
  velocities: THREE.Vector3[];
  age: number;
}

/** Short particle bursts where pieces are placed or removed (driven by activity events). */
export class Effects {
  private readonly puffs: Puff[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.09, 0.09, 0.09);

  constructor(private readonly scene: THREE.Scene) {}

  puff(x: number, z: number, color: string): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true });
    const group = new THREE.Group();
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < PUFF_PARTICLES; i++) {
      const angle = (i / PUFF_PARTICLES) * Math.PI * 2;
      group.add(new THREE.Mesh(this.geometry, material));
      velocities.push(
        new THREE.Vector3(
          Math.cos(angle) * 1.6,
          2.2 + (i % 3) * 0.6,
          Math.sin(angle) * 1.6,
        ),
      );
    }
    group.position.set(x, 0.2, z);
    this.scene.add(group);
    this.puffs.push({ group, velocities, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.age += dt;
      const t = puff.age / PUFF_SECONDS;
      puff.group.children.forEach((child, j) => {
        const v = puff.velocities[j];
        v.y -= 6 * dt;
        child.position.addScaledVector(v, dt);
        child.rotation.x += dt * 6;
      });
      const material = (puff.group.children[0] as THREE.Mesh)
        .material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        puff.group.removeFromParent();
        material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }
}

/** Pseudo-random but stable, so every client decorates the beach the same way. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Purely decorative trees and rocks on the beach, outside the walkable area. */
export function decorateBeach(scene: THREE.Scene): void {
  const random = seeded(20261004);
  const kinds: PieceKind[] = ['pine', 'pine', 'tree', 'rock'];
  const inner = WORLD_LIMIT + 0.6;
  const outer = BEACH_HALF - 0.5;
  for (let i = 0; i < 44; i++) {
    const side = i % 4;
    const along = (random() * 2 - 1) * outer;
    const across = inner + random() * (outer - inner);
    const [x, z] =
      side === 0
        ? [along, across]
        : side === 1
          ? [along, -across]
          : side === 2
            ? [across, along]
            : [-across, along];
    const model = createPieceModel(kinds[Math.floor(random() * kinds.length)]);
    model.position.set(x, SAND_TOP, z);
    model.rotation.y = random() * Math.PI * 2;
    model.scale.setScalar(0.9 + random() * 0.5);
    scene.add(model);
  }
}
