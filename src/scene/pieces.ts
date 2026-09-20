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
import {
  createConnectedModel,
  isConnective,
  NEIGHBOURS,
} from './connectedModels';
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
 * Renders the `piece` table: one model per row, keyed by tile. Fences and paths are
 * drawn from their neighbourhood, so placing or removing one also redraws its
 * same-kind neighbours.
 */
export class PieceLayer {
  private readonly placed = new Map<number, Placed>();

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

  update(dt: number): void {
    for (const entry of this.placed.values()) {
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

  /** Same-kind neighbours as NEIGHBOURS bits. */
  private maskFor(entry: Placed): number {
    let mask = 0;
    for (const n of NEIGHBOURS) {
      if (
        this.at(entry.tileX + n.dx, entry.tileZ + n.dz)?.kind === entry.kind
      ) {
        mask |= n.bit;
      }
    }
    return mask;
  }

  /** (Re)builds an entry's model in place, keeping its pop-in progress. */
  private draw(entry: Placed): void {
    const kind = entry.kind;
    // Connected models are built in world directions, so only the others rotate.
    const object = isConnective(kind)
      ? createConnectedModel(kind, this.maskFor(entry), entry.rotation)
      : createPieceModel(kind);
    if (!isConnective(kind)) object.rotation.y = (entry.rotation * Math.PI) / 2;
    object.position.set(tileToWorld(entry.tileX), 0, tileToWorld(entry.tileZ));
    if (entry.age === 0) object.scale.setScalar(0.001);
    else object.scale.copy(entry.object.scale);
    entry.object.removeFromParent();
    entry.object = object;
    this.scene.add(object);
  }

  private redrawNeighbours(x: number, z: number): void {
    for (const n of NEIGHBOURS) {
      const neighbour = this.at(x + n.dx, z + n.dz);
      if (neighbour && isConnective(neighbour.kind)) this.draw(neighbour);
    }
  }
}
