import * as THREE from 'three';
import {
  inBounds,
  tileKey,
  tileToWorld,
} from '../../spacetimedb/src/logic/grid';
import {
  GROUND,
  isPieceKind,
  OVERLAY,
  type PieceKind,
} from '../../spacetimedb/src/logic/pieces';
import type { Piece } from '../module_bindings/types';
import { createConnectedModel, isConnective } from './connectedModels';
import { createPieceModel } from './pieceModels';

const POP_SECONDS = 0.35;

/** How far fireflies rise over a tall piece on the same tile, so they circle its top. */
const OVERLAY_LIFT: Partial<Record<PieceKind, number>> = {
  tree: 0.55,
  pine: 0.6,
  lamp: 0.4,
};

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

interface Placed {
  /** The `piece` row drawn here; a tile can get a new row in the same transaction. */
  id: bigint;
  object: THREE.Group;
  kind: PieceKind;
  layer: number;
  rotation: number;
  tileX: number;
  tileZ: number;
  age: number;
}

/** One entry per tile and layer. */
function slot(layer: number, key: number): number {
  return layer * 1000 + key;
}

/**
 * Renders the `piece` table: one model per row, keyed by tile and layer (ground, or
 * fireflies floating above). Connective pieces (fences, walls, paths, water, tiles,
 * bridges) are drawn from their ground neighbourhood, so placing or removing one also
 * redraws its neighbours.
 */
export class PieceLayer {
  private readonly placed = new Map<number, Placed>();
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {}

  upsert(row: Piece): void {
    if (!isPieceKind(row.kind)) return;
    const key = slot(row.layer, row.tileKey);
    const existing = this.placed.get(key);
    if (existing && existing.kind === row.kind) {
      existing.id = row.id;
      existing.rotation = row.rotation;
      this.draw(existing);
      return;
    }
    existing?.object.removeFromParent();
    const entry: Placed = {
      id: row.id,
      object: new THREE.Group(),
      kind: row.kind,
      layer: row.layer,
      rotation: row.rotation,
      tileX: row.tileX,
      tileZ: row.tileZ,
      age: 0,
    };
    this.placed.set(key, entry);
    this.draw(entry);
    this.afterChange(row);
  }

  /**
   * Removes the row's model. When one transaction replaces a tile's piece (loading a
   * build), the new row's insert can arrive before the old row's delete, so only the
   * row actually drawn on the tile is removed.
   */
  remove(row: Piece): void {
    const key = slot(row.layer, row.tileKey);
    const entry = this.placed.get(key);
    if (!entry || entry.id !== row.id) return;
    entry.object.removeFromParent();
    this.placed.delete(key);
    this.afterChange(row);
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

  /** The ground piece on a tile; connections only ever look at the ground. */
  private at(x: number, z: number): Placed | undefined {
    return inBounds(x, z)
      ? this.placed.get(slot(GROUND, tileKey(x, z)))
      : undefined;
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
    const below =
      entry.layer === OVERLAY ? this.at(entry.tileX, entry.tileZ) : undefined;
    object.position.set(
      tileToWorld(entry.tileX),
      below ? (OVERLAY_LIFT[below.kind] ?? 0) : 0,
      tileToWorld(entry.tileZ),
    );
    if (entry.age === 0) object.scale.setScalar(0.001);
    else object.scale.copy(entry.object.scale);
    entry.object.removeFromParent();
    entry.object = object;
    this.scene.add(object);
  }

  /**
   * A ground change redraws connected neighbours on all eight sides (water and paths
   * fill corners from diagonals) and the fireflies above it, which follow its height.
   */
  private afterChange(row: Piece): void {
    if (row.layer !== GROUND) return;
    const { tileX: x, tileZ: z } = row;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const neighbour = dx || dz ? this.at(x + dx, z + dz) : undefined;
        if (neighbour && isConnective(neighbour.kind)) this.draw(neighbour);
      }
    }
    const above = this.placed.get(slot(OVERLAY, row.tileKey));
    if (above) this.draw(above);
  }
}
