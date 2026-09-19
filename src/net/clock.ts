const MAX_SAMPLES = 20;

/**
 * Estimates the server clock from server timestamps observed on arrival. Network
 * latency only ever makes a sample read low, so the largest recent offset is the
 * best estimate. Countdowns use this instead of trusting the local clock.
 */
export class ServerClock {
  private readonly offsets: number[] = [];

  /** Records a server timestamp (µs since epoch) that was just created. */
  sample(serverMicros: bigint): void {
    this.offsets.push(Number(serverMicros / 1000n) - Date.now());
    if (this.offsets.length > MAX_SAMPLES) this.offsets.shift();
  }

  nowMs(): number {
    const offset = this.offsets.length ? Math.max(...this.offsets) : 0;
    return Date.now() + offset;
  }

  /** Whole seconds until a server timestamp, never negative. */
  secondsUntil(serverMicros: bigint): number {
    return Math.max(
      0,
      Math.ceil((Number(serverMicros / 1000n) - this.nowMs()) / 1000),
    );
  }
}
