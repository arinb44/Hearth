import * as THREE from 'three';
import {
  inBounds,
  tileKey,
  tileToWorld,
} from '../../spacetimedb/src/logic/grid';
import {
  isPieceKind,
  type PieceKind,
} from '../../spacetimedb/src/logic/pieces';
import type { Piece } from '../module_bindings/types';
import { createConnectedModel, isConnective } from './connectedModels';
import { createPieceModel } from './pieceModels';

const POP_SECONDS = 0.35;

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

interface Placed {
  object: THREE.Group;
  kind: PieceKind;
  rotation: number;
  tileX: number;
  tileZ: number;
  age: number;
}

/**
 * Renders the `piece` table: one model per row, keyed by tile. Connective pieces
 * (fences, paths, water, tiles, bridges) are drawn from their neighbourhood, so
 * placing or removing one also redraws its neighbours.
 */
export class PieceLayer {
  private readonly placed = new Map<number, Placed>();
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {}

  upsert(row: Piece): void {
    if (!isPieceKind(row.kind)) return;
    const existing = this.placed.get(row.tileKey);
    if (existing && existing.kind === row.kind) {
      existing.rotation = row.rotation;
      this.draw(existing);
      return;
    }
    existing?.object.removeFromParent();
    const entry: Placed = {
      object: new THREE.Group(),
      kind: row.kind,
      rotation: row.rotation,
      tileX: row.tileX,
      tileZ: row.tileZ,
      age: 0,
    };
    this.placed.set(row.tileKey, entry);
    this.draw(entry);
    this.redrawNeighbours(row.tileX, row.tileZ);
  }

  remove(row: Piece): void {
    this.placed.get(row.tileKey)?.object.removeFromParent();
    this.placed.delete(row.tileKey);
    this.redrawNeighbours(row.tileX, row.tileZ);
  }

  /** Removes every piece, when switching islands. */
  clear(): void {
    for (const entry of this.placed.values()) entry.object.removeFromParent();
    this.placed.clear();
  }

  update(dt: number): void {
    this.time += dt;
    for (const entry of this.placed.values()) {
      entry.object.userData.animate?.(this.time);
      if (entry.age >= POP_SECONDS) continue;
      entry.age = Math.min(entry.age + dt, POP_SECONDS);
      entry.object.scale.setScalar(
        Math.max(0.001, easeOutBack(entry.age / POP_SECONDS)),
      );
    }
  }

  private at(x: number, z: number): Placed | undefined {
    return inBounds(x, z) ? this.placed.get(tileKey(x, z)) : undefined;
  }

  /** (Re)builds an entry's model in place, keeping its pop-in progress. */
  private draw(entry: Placed): void {
    const kind = entry.kind;
    // Connected models are built in world directions, so only the others rotate.
    const object = isConnective(kind)
      ? createConnectedModel(
          kind,
          (dx, dz) => this.at(entry.tileX + dx, entry.tileZ + dz)?.kind,
          entry.rotation,
        )
      : createPieceModel(kind);
    if (!isConnective(kind)) object.rotation.y = (entry.rotation * Math.PI) / 2;
    object.position.set(tileToWorld(entry.tileX), 0, tileToWorld(entry.tileZ));
    if (entry.age === 0) object.scale.setScalar(0.001);
    else object.scale.copy(entry.object.scale);
    entry.object.removeFromParent();
    entry.object = object;
    this.scene.add(object);
  }

  /** All eight surrounding tiles: water and paths also fill corners from diagonals. */
  private redrawNeighbours(x: number, z: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const neighbour = dx || dz ? this.at(x + dx, z + dz) : undefined;
        if (neighbour && isConnective(neighbour.kind)) this.draw(neighbour);
      }
    }
  }
}
