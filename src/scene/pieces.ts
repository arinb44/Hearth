import * as THREE from 'three';
import { tileToWorld } from '../../spacetimedb/src/logic/grid';
import { isPieceKind } from '../../spacetimedb/src/logic/pieces';
import type { Piece } from '../module_bindings/types';
import { createPieceModel } from './pieceModels';

const POP_SECONDS = 0.35;

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

interface Placed {
  object: THREE.Group;
  kind: string;
  age: number;
}

/** Renders the `piece` table: one model per row, keyed by tile. */
export class PieceLayer {
  private readonly placed = new Map<number, Placed>();

  constructor(private readonly scene: THREE.Scene) {}

  upsert(row: Piece): void {
    if (!isPieceKind(row.kind)) return;
    let entry = this.placed.get(row.tileKey);
    if (!entry || entry.kind !== row.kind) {
      if (entry) entry.object.removeFromParent();
      const object = createPieceModel(row.kind);
      object.position.set(tileToWorld(row.tileX), 0, tileToWorld(row.tileZ));
      object.scale.setScalar(0.001);
      this.scene.add(object);
      entry = { object, kind: row.kind, age: 0 };
      this.placed.set(row.tileKey, entry);
    }
    entry.object.rotation.y = (row.rotation * Math.PI) / 2;
  }

  remove(row: Piece): void {
    this.placed.get(row.tileKey)?.object.removeFromParent();
    this.placed.delete(row.tileKey);
  }

  update(dt: number): void {
    for (const entry of this.placed.values()) {
      if (entry.age >= POP_SECONDS) continue;
      entry.age = Math.min(entry.age + dt, POP_SECONDS);
      entry.object.scale.setScalar(
        Math.max(0.001, easeOutBack(entry.age / POP_SECONDS)),
      );
    }
  }
}
