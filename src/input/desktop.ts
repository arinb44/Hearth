import type { Vec2 } from '../../spacetimedb/src/logic/movement';

const KEY_DIRECTIONS: Record<string, Vec2> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.isContentEditable);
}

/** Tracks held movement keys and reports a unit (or zero) direction in world space. */
export class KeyboardMovement {
  private readonly held = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || !(e.code in KEY_DIRECTIONS)) return;
      this.held.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  direction(): Vec2 {
    let x = 0;
    let z = 0;
    for (const code of this.held) {
      x += KEY_DIRECTIONS[code].x;
      z += KEY_DIRECTIONS[code].z;
    }
    const length = Math.hypot(x, z);
    return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
  }
}
