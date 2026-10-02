// Round timing shared by the module and the client.
// Pure TypeScript: must not import spacetimedb/server.

export interface RoundTiming {
  /** Lobby auto-start delay once players are present; 0 disables auto-start. */
  lobbySeconds: number;
  buildSeconds: number;
  scoringSeconds: number;
  votingSeconds: number;
  resultsSeconds: number;
  /** How long each build is on show in a battle's showcase tour. */
  showcaseSeconds: number;
}

export const DEFAULT_TIMING: RoundTiming = {
  lobbySeconds: 30,
  buildSeconds: 120,
  scoringSeconds: 4,
  votingSeconds: 25,
  resultsSeconds: 12,
  showcaseSeconds: 8,
};

export const MAX_PHASE_SECONDS = 600;

export function isValidTiming(timing: RoundTiming): boolean {
  const { lobbySeconds, ...timed } = timing;
  const inRange = (s: number, min: number) =>
    Number.isInteger(s) && s >= min && s <= MAX_PHASE_SECONDS;
  return (
    inRange(lobbySeconds, 0) && Object.values(timed).every((s) => inRange(s, 1))
  );
}

export function secondsToMicros(seconds: number): bigint {
  return BigInt(Math.round(seconds * 1_000_000));
}
