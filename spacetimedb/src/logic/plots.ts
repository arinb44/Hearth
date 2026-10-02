// Build Battle: every builder gets a private full-size board for the round, and then
// everyone tours the builds and votes. A `plot` row records who builds on which board.
// Pure TypeScript: must not import spacetimedb/server.

/** Builders per battle (everyone but the idea's host), one private board each. */
export const MAX_PLOTS = 9;

/** `piece.board` of a builder's private board; board 0 is the island's shared board. */
export function boardOfPlot(plotIndex: number): number {
  return plotIndex + 1;
}

/**
 * The build to show after `current` in the showcase tour (start from 0, the shared
 * board), in board order; null once every build has been shown.
 */
export function nextShowcase(
  boards: readonly number[],
  current: number,
): number | null {
  const next = [...boards].sort((a, b) => a - b).find((b) => b > current);
  return next ?? null;
}

/** Winning plots: the most votes (at least one); ties share the win. */
export function plotWinners(tally: Map<number, number>): number[] {
  const best = Math.max(0, ...tally.values());
  if (best === 0) return [];
  return [...tally]
    .filter(([, n]) => n === best)
    .map(([plot]) => plot)
    .sort((a, b) => a - b);
}
