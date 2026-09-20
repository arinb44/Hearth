// Reconnecting by reloading: the saved token restores the same identity, and a fresh
// page rebuilds every subscription and scene object from scratch, with no stale state.
const ATTEMPTS_KEY = 'coop-builder:reconnect-attempts';
const MAX_DELAY_S = 30;

function attempts(): number {
  try {
    return Number(sessionStorage.getItem(ATTEMPTS_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function setAttempts(n: number): void {
  try {
    sessionStorage.setItem(ATTEMPTS_KEY, String(n));
  } catch {
    // Storage unavailable: every retry uses the shortest delay.
  }
}

/** Call once connected, so the next outage starts again from the shortest delay. */
export function resetReconnectBackoff(): void {
  setAttempts(0);
}

/**
 * Shows the reconnect banner and reloads after an exponential backoff
 * (2 s, 4 s, 8 s … up to 30 s). `onTick` receives the seconds remaining.
 */
export function scheduleReconnect(onTick: (seconds: number) => void): void {
  const n = attempts();
  setAttempts(n + 1);
  let remaining = Math.min(MAX_DELAY_S, 2 ** (n + 1));
  onTick(remaining);
  const timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      onTick(remaining);
      return;
    }
    window.clearInterval(timer);
    location.reload();
  }, 1000);
}
