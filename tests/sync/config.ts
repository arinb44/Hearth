import type { RoundTiming } from '../../spacetimedb/src/logic/phases';

export const TEST_HOST = 'ws://127.0.0.1:3000';
export const TEST_DB = 'coop-builder-test';
export const SPACETIME_CLI = process.env.SPACETIME_CLI || 'spacetime';

/** Short phases for tests; auto-start is off so rounds never begin mid-test. */
export const TEST_TIMING: RoundTiming = {
  lobbySeconds: 0,
  buildSeconds: 4,
  scoringSeconds: 1,
  votingSeconds: 2,
  resultsSeconds: 1,
};
