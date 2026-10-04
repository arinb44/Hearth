import * as THREE from 'three';
import { worldToTile, type Tile } from '../../spacetimedb/src/logic/grid';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** A touch counts as a tap (not a drag) if it moves less than this and ends quickly. */
const TAP_SLOP_PX = 12;
const TAP_MS = 450;

export interface PointerHandlers {
  onPrimary(tile: Tile): void;
  onSecondary(tile: Tile): void;
}

/** Which mouse button is held down: left places, right removes. */
export type HeldButton = 'primary' | 'secondary' | null;

/**
 * Tracks the pointer over the canvas and maps it to the ground tile beneath it.
 * The tile is recomputed on demand because the follow camera keeps moving.
 */
export class PointerInput {
  private readonly ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly hit = new THREE.Vector3();
  private inside = false;
  private touchStart: { x: number; y: number; time: number } | null = null;
  private heldButton: HeldButton = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly camera: THREE.Camera,
    handlers: PointerHandlers,
  ) {
    canvas.addEventListener('pointermove', (e) => {
      this.track(e);
      // A release outside the window never reaches us; the buttons tell.
      if (e.pointerType === 'mouse' && e.buttons === 0) this.heldButton = null;
    });
    canvas.addEventListener('pointerleave', () => {
      this.inside = false;
      this.heldButton = null;
    });
    window.addEventListener('blur', () => (this.heldButton = null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.track(e);
      if (e.pointerType !== 'mouse') {
        this.touchStart = { x: e.clientX, y: e.clientY, time: e.timeStamp };
        return;
      }
      this.heldButton =
        e.button === 0 ? 'primary' : e.button === 2 ? 'secondary' : null;
      const tile = this.tile();
      if (!tile) return;
      if (e.button === 0) handlers.onPrimary(tile);
      else if (e.button === 2) handlers.onSecondary(tile);
    });
    // Touch acts on release, and only for a tap, so a stray drag never builds.
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.heldButton = null;
      const start = this.touchStart;
      this.touchStart = null;
      if (e.pointerType === 'mouse' || !start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > TAP_SLOP_PX || e.timeStamp - start.time > TAP_MS) return;
      this.track(e);
      const tile = this.tile();
      if (tile) handlers.onPrimary(tile);
    });
  }

  /** The mouse button held down since the last press on the canvas, if any. */
  held(): HeldButton {
    return this.heldButton;
  }

  /** The tile under the pointer, or null when the pointer is off the canvas. */
  tile(): Tile | null {
    if (!this.inside) return null;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(GROUND, this.hit)) return null;
    return { x: worldToTile(this.hit.x), z: worldToTile(this.hit.z) };
  }

  private track(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.inside = true;
  }
}
