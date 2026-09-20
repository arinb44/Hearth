import type { Vec2 } from '../../spacetimedb/src/logic/movement';

/** True on phones and tablets (a finger is the primary pointer). */
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

const RADIUS = 48; // px the knob can travel from the center
const DEAD_ZONE = 0.15;

/** On-screen joystick for touch devices; reports a world direction of length ≤ 1. */
export class TouchJoystick {
  private readonly base = document.getElementById('joystick')!;
  private readonly knob = this.base.querySelector<HTMLElement>('.knob')!;
  private pointerId: number | null = null;
  private vector: Vec2 = { x: 0, z: 0 };

  constructor() {
    this.base.hidden = !IS_TOUCH;
    this.base.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.base.setPointerCapture(e.pointerId);
      this.track(e);
    });
    this.base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.track(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.vector = { x: 0, z: 0 };
      this.knob.style.transform = '';
    };
    this.base.addEventListener('pointerup', release);
    this.base.addEventListener('pointercancel', release);
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  direction(): Vec2 {
    return this.vector;
  }

  private track(e: PointerEvent): void {
    const rect = this.base.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > RADIUS) {
      dx = (dx / length) * RADIUS;
      dy = (dy / length) * RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen up is world -z, matching the keyboard mapping and the fixed camera.
    const strength = Math.min(length, RADIUS) / RADIUS;
    this.vector =
      strength < DEAD_ZONE
        ? { x: 0, z: 0 }
        : { x: dx / RADIUS, z: dy / RADIUS };
  }
}
