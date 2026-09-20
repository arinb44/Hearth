import * as THREE from 'three';
import { tileToWorld, type Tile } from '../../spacetimedb/src/logic/grid';
import type { Vec2 } from '../../spacetimedb/src/logic/movement';
import {
  BUILD_ERROR_MESSAGES,
  BUILD_REACH,
  checkModify,
  canBuildInPhase,
  checkPlacement,
  PIECE_KINDS,
  type BuildError,
  type PieceKind,
} from '../../spacetimedb/src/logic/pieces';
import { PointerInput } from '../input/pointer';
import { IS_TOUCH } from '../input/touch';
import type { DbConnection } from '../module_bindings';
import { buildRestriction, pieceAt } from '../net/queries';
import { createGhostModel } from '../scene/pieceModels';
import type { World } from '../scene/world';
import { hotkeyFor, Palette } from '../ui/palette';
import type { Toast } from '../ui/toast';

const VALID = new THREE.Color('#40c057');
const INVALID = new THREE.Color('#fa5252');

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Placement UI: palette selection, a ghost preview tinted by the shared build rules,
 * and reducer calls. The server re-checks every action; the preview only predicts.
 */
export class Builder {
  private selected: PieceKind = 'house';
  private rotation = 0;
  private removeMode = false;
  private enabled = false;
  private canBuildShown = true;
  private readonly hint = document.getElementById('hint')!;
  private ghost: THREE.Group | null = null;
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  private readonly outline: THREE.LineLoop;
  private readonly reachRing: THREE.Mesh;
  private readonly pointer: PointerInput;
  private readonly palette: Palette;

  constructor(
    private readonly world: World,
    private readonly conn: DbConnection,
    private readonly toast: Toast,
    private readonly playerPos: () => Vec2 | null,
    private readonly myHex: string,
  ) {
    const square = new THREE.BufferGeometry().setFromPoints(
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].map(([x, z]) => new THREE.Vector3(x, 0.03, z)),
    );
    this.outline = new THREE.LineLoop(square, new THREE.LineBasicMaterial());
    this.reachRing = new THREE.Mesh(
      new THREE.RingGeometry(BUILD_REACH - 0.06, BUILD_REACH, 72),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    world.scene.add(this.outline, this.reachRing);

    this.pointer = new PointerInput(world.renderer.domElement, world.camera, {
      onPrimary: (tile) => this.primary(tile),
      onSecondary: (tile) => this.remove(tile),
    });
    this.palette = new Palette(
      (kind) => this.select(kind),
      IS_TOUCH
        ? {
            onRotate: () => (this.rotation = (this.rotation + 1) % 4),
            onToggleRemove: () => this.setRemoveMode(!this.removeMode),
          }
        : undefined,
    );
    this.select('house');
    this.setEnabled(false);

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (!this.enabled || target?.tagName === 'INPUT') return;
      const index = PIECE_KINDS.findIndex((_, i) => hotkeyFor(i) === e.key);
      if (index >= 0) this.select(PIECE_KINDS[index]);
      else if (e.code === 'KeyR' || e.code === 'KeyE')
        this.rotation = (this.rotation + 1) % 4;
      else if (e.code === 'KeyQ') this.rotation = (this.rotation + 3) % 4;
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.palette.setVisible(enabled);
    if (!enabled) {
      this.outline.visible = false;
      this.reachRing.visible = false;
      if (this.ghost) this.ghost.visible = false;
    }
  }

  update(): void {
    if (!this.enabled) return;
    // Hide the palette whenever building is impossible: between rounds' build phases,
    // or for battle hosts and spectators.
    const canBuild =
      canBuildInPhase(this.phase()) &&
      buildRestriction(this.conn, this.myHex) !== null;
    if (canBuild !== this.canBuildShown) {
      this.canBuildShown = canBuild;
      this.palette.setVisible(canBuild);
      this.hint.hidden = !canBuild;
    }
    if (!canBuild) {
      this.outline.visible = false;
      this.reachRing.visible = false;
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const pos = this.playerPos();
    const tile = this.pointer.tile();
    this.reachRing.visible = pos !== null;
    if (pos) this.reachRing.position.set(pos.x, 0.02, pos.z);

    if (!pos || !tile) {
      this.outline.visible = false;
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const occupied = this.isOccupied(tile);
    const error =
      occupied || this.removeMode
        ? this.checkModify(tile, pos)
        : this.checkPlace(tile, pos);
    const color = error ? INVALID : VALID;

    this.outline.visible = true;
    this.outline.position.set(tileToWorld(tile.x), 0, tileToWorld(tile.z));
    (this.outline.material as THREE.LineBasicMaterial).color.copy(color);

    const ghost = this.ghost!;
    ghost.visible = !occupied && !this.removeMode;
    ghost.position.copy(this.outline.position);
    ghost.rotation.y = (this.rotation * Math.PI) / 2;
    this.ghostMaterial.color.copy(color);
  }

  private setRemoveMode(on: boolean): void {
    this.removeMode = on;
    this.palette.setRemoveMode(on);
  }

  private select(kind: PieceKind): void {
    this.selected = kind;
    this.palette.setSelected(kind);
    this.setRemoveMode(false);
    this.ghost?.removeFromParent();
    this.ghost = createGhostModel(kind, this.ghostMaterial);
    this.ghost.visible = false;
    this.world.scene.add(this.ghost);
  }

  private phase(): string {
    return this.conn.db.gameState.id.find(0)?.phase.tag ?? 'Lobby';
  }

  private isOccupied(tile: Tile): boolean {
    return pieceAt(this.conn, tile) !== undefined;
  }

  private checkPlace(tile: Tile, playerPos: Vec2): BuildError | null {
    return checkPlacement({
      kind: this.selected,
      rotation: this.rotation,
      tile,
      phase: this.phase(),
      occupied: this.isOccupied(tile),
      playerPos,
      plot: buildRestriction(this.conn, this.myHex),
    });
  }

  private checkModify(tile: Tile, playerPos: Vec2): BuildError | null {
    return checkModify({
      tile,
      phase: this.phase(),
      occupied: this.isOccupied(tile),
      playerPos,
      plot: buildRestriction(this.conn, this.myHex),
    });
  }

  /** Click or tap: place on an empty tile, rotate an existing piece (or remove, in remove mode). */
  private primary(tile: Tile): void {
    if (this.removeMode) return this.remove(tile);
    const pos = this.playerPos();
    if (!this.enabled || !pos) return;
    const occupied = this.isOccupied(tile);
    const error = occupied
      ? this.checkModify(tile, pos)
      : this.checkPlace(tile, pos);
    if (error) return this.toast.show(BUILD_ERROR_MESSAGES[error]);
    const call = occupied
      ? this.conn.reducers.rotatePiece({ tileX: tile.x, tileZ: tile.z })
      : this.conn.reducers.placePiece({
          kind: this.selected,
          tileX: tile.x,
          tileZ: tile.z,
          rotation: this.rotation,
        });
    call.catch((err: unknown) => this.toast.show(errorMessage(err)));
  }

  private remove(tile: Tile): void {
    const pos = this.playerPos();
    if (!this.enabled || !pos) return;
    const error = this.checkModify(tile, pos);
    if (error) return this.toast.show(BUILD_ERROR_MESSAGES[error]);
    this.conn.reducers
      .removePiece({ tileX: tile.x, tileZ: tile.z })
      .catch((err: unknown) => this.toast.show(errorMessage(err)));
  }
}
