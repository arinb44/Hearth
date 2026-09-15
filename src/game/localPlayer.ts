import {
  clampToWorld,
  WALK_SPEED,
  type Vec2,
} from '../../spacetimedb/src/logic/movement';
import type { DbConnection } from '../module_bindings';
import type { Player } from '../module_bindings/types';

const SEND_INTERVAL_MS = 100;
const SENT_HISTORY = 30;
/** f32 storage on the server rounds positions slightly. */
const MATCH_TOLERANCE = 0.05;

/**
 * Client-side prediction for the local player: moves instantly on input, sends
 * positions at up to 10 Hz, and snaps back only when the server stored a position
 * we never sent (i.e. it clamped us).
 */
export class LocalPlayer {
  pos: Vec2;
  heading: number;
  private lastSentAt = 0;
  private unsent = false;
  private readonly sent: Vec2[] = [];

  constructor(
    private readonly conn: DbConnection,
    start: Player,
  ) {
    this.pos = { x: start.x, z: start.z };
    this.heading = start.heading;
  }

  update(dt: number, direction: Vec2, nowMs: number): void {
    if (direction.x !== 0 || direction.z !== 0) {
      this.pos = clampToWorld({
        x: this.pos.x + direction.x * WALK_SPEED * dt,
        z: this.pos.z + direction.z * WALK_SPEED * dt,
      });
      this.heading = Math.atan2(direction.x, direction.z);
      this.unsent = true;
    }
    if (this.unsent && nowMs - this.lastSentAt >= SEND_INTERVAL_MS) {
      this.send(nowMs);
    }
  }

  /** Called with every server update of our own row. */
  reconcile(server: Player): void {
    const matchesSent = this.sent.some(
      (p) => Math.hypot(p.x - server.x, p.z - server.z) <= MATCH_TOLERANCE,
    );
    if (!matchesSent) {
      this.pos = { x: server.x, z: server.z };
      this.sent.length = 0;
    }
  }

  private send(nowMs: number): void {
    this.lastSentAt = nowMs;
    this.unsent = false;
    this.sent.push({ ...this.pos });
    if (this.sent.length > SENT_HISTORY) this.sent.shift();
    this.conn.reducers
      .move({ x: this.pos.x, z: this.pos.z, heading: this.heading })
      .catch((err: unknown) => console.warn('move rejected', err));
  }
}
