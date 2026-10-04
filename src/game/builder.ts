import * as THREE from 'three';
import {
  tileLine,
  tileToWorld,
  type Tile,
} from '../../spacetimedb/src/logic/grid';
import { SHARED_BOARD } from '../../spacetimedb/src/logic/islands';
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
  type TileContents,
} from '../../spacetimedb/src/logic/pieces';
import { PointerInput } from '../input/pointer';
import { IS_TOUCH } from '../input/touch';
import type { DbConnection } from '../module_bindings';
import {
  myBuildBoard,
  myGameState,
  myIslandId,
  tileContents,
} from '../net/queries';
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
  /** The last tile handled while a mouse button is held, so a drag acts once per tile. */
  private dragFrom: Tile | null = null;
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
      myBuildBoard(this.conn, this.myHex) !== null;
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
    this.continueDrag(tile, pos);
    this.reachRing.visible = pos !== null;
    if (pos) this.reachRing.position.set(pos.x, 0.02, pos.z);

    if (!pos || !tile) {
      this.outline.visible = false;
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const contents = this.contents(tile);
    const placing = !this.removeMode && this.placesOn(contents, tile, pos);
    const error = placing
      ? this.checkPlace(tile, pos, contents)
      : this.checkModify(tile, pos, contents);
    const color = error ? INVALID : VALID;

    this.outline.visible = true;
    this.outline.position.set(tileToWorld(tile.x), 0, tileToWorld(tile.z));
    (this.outline.material as THREE.LineBasicMaterial).color.copy(color);

    const ghost = this.ghost!;
    ghost.visible = placing;
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
    return myGameState(this.conn, this.myHex)?.phase.tag ?? 'Lobby';
  }

  /** What stands on a tile of the board the player builds on. */
  private contents(tile: Tile): TileContents {
    const board = myBuildBoard(this.conn, this.myHex) ?? SHARED_BOARD;
    return tileContents(
      this.conn,
      myIslandId(this.conn, this.myHex),
      tile,
      board,
    );
  }

  private watching(): boolean {
    return myBuildBoard(this.conn, this.myHex) === null;
  }

  /**
   * Whether a click places the selected piece (rather than rotating what is there):
   * on an empty tile, or wherever the piece can stack, like fireflies over a tree.
   * Fireflies aimed at a building also count, so the player sees why they can't go
   * there instead of the building quietly turning.
   */
  private placesOn(contents: TileContents, tile: Tile, pos: Vec2): boolean {
    if (!contents.ground && !contents.overlay) return true;
    const error = this.checkPlace(tile, pos, contents);
    return error === null || error === 'cannot_stack';
  }

  private checkPlace(
    tile: Tile,
    playerPos: Vec2,
    contents: TileContents,
  ): BuildError | null {
    return checkPlacement({
      kind: this.selected,
      rotation: this.rotation,
      tile,
      phase: this.phase(),
      contents,
      playerPos,
      watching: this.watching(),
    });
  }

  private checkModify(
    tile: Tile,
    playerPos: Vec2,
    contents: TileContents,
  ): BuildError | null {
    return checkModify({
      tile,
      phase: this.phase(),
      contents,
      playerPos,
      watching: this.watching(),
    });
  }

  /**
   * Hold and sweep with the mouse: each tile the pointer reaches (and every tile in
   * between) gets the selected piece, or loses its top piece with the right button.
   * Runs every frame, so it also follows the camera while the player walks. Tiles
   * where that can't happen are skipped quietly, and a drag never rotates.
   */
  private continueDrag(tile: Tile | null, pos: Vec2 | null): void {
    const held = this.pointer.held();
    if (!held || !tile || !pos || !this.dragFrom) {
      if (!held) this.dragFrom = null;
      return;
    }
    if (tile.x === this.dragFrom.x && tile.z === this.dragFrom.z) return;
    const removing = held === 'secondary' || this.removeMode;
    for (const t of tileLine(this.dragFrom, tile)) {
      const contents = this.contents(t);
      const call = removing
        ? this.checkModify(t, pos, contents) === null &&
          this.conn.reducers.removePiece({ tileX: t.x, tileZ: t.z })
        : this.checkPlace(t, pos, contents) === null &&
          this.conn.reducers.placePiece({
            kind: this.selected,
            tileX: t.x,
            tileZ: t.z,
            rotation: this.rotation,
          });
      // A tile someone else just took is fine to skip mid-drag.
      if (call) call.catch(() => {});
    }
    this.dragFrom = tile;
  }

  /**
   * Click or tap: place the selected piece where it fits, otherwise rotate the piece
   * already there (or remove, in remove mode).
   */
  private primary(tile: Tile): void {
    this.dragFrom = tile;
    if (this.removeMode) return this.remove(tile);
    const pos = this.playerPos();
    if (!this.enabled || !pos) return;
    const contents = this.contents(tile);
    const placing = this.placesOn(contents, tile, pos);
    const error = placing
      ? this.checkPlace(tile, pos, contents)
      : this.checkModify(tile, pos, contents);
    if (error) return this.toast.show(BUILD_ERROR_MESSAGES[error]);
    const call = !placing
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
    this.dragFrom = tile;
    const pos = this.playerPos();
    if (!this.enabled || !pos) return;
    const error = this.checkModify(tile, pos, this.contents(tile));
    if (error) return this.toast.show(BUILD_ERROR_MESSAGES[error]);
    this.conn.reducers
      .removePiece({ tileX: tile.x, tileZ: tile.z })
      .catch((err: unknown) => this.toast.show(errorMessage(err)));
  }
}
