// Co-op scoring shared by the module (authoritative score) and the client (live
// checklist). Pure TypeScript: must not import spacetimedb/server.
import type { Challenge, Target } from './challenges';

export interface BoardPiece {
  kind: string;
  tileX: number;
  tileZ: number;
}

export interface TargetProgress {
  label: string;
  value: number;
  goal: number;
  done: boolean;
  /** 0..1 */
  completion: number;
}

export interface Evaluation {
  targets: TargetProgress[];
  complete: boolean;
  /** Average target completion, 0..1. */
  completion: number;
}

export const MAX_TARGET_POINTS = 100;
export const MAX_TIME_BONUS = 50;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function evaluateTarget(target: Target, pieces: BoardPiece[]): TargetProgress {
  if (target.type === 'count') {
    const value = pieces.filter((p) =>
      (target.kinds as string[]).includes(p.kind),
    ).length;
    const completion = Math.min(1, value / target.min);
    return {
      label: target.label,
      value,
      goal: target.min,
      done: value >= target.min,
      completion,
    };
  }

  const kindAt = new Map(pieces.map((p) => [`${p.tileX},${p.tileZ}`, p.kind]));
  const subjects = pieces.filter((p) => p.kind === target.kind);
  const value = subjects.filter((p) =>
    NEIGHBOURS.some(([dx, dz]) => {
      const neighbour = kindAt.get(`${p.tileX + dx},${p.tileZ + dz}`);
      return (
        neighbour !== undefined && (target.to as string[]).includes(neighbour)
      );
    }),
  ).length;
  const goal = subjects.length;
  const done = goal > 0 && value === goal;
  return {
    label: target.label,
    value,
    goal,
    done,
    completion: goal === 0 ? 0 : value / goal,
  };
}

export function evaluateChallenge(
  challenge: Challenge,
  pieces: BoardPiece[],
): Evaluation {
  const targets = challenge.targets.map((t) => evaluateTarget(t, pieces));
  const completion =
    targets.reduce((sum, t) => sum + t.completion, 0) /
    Math.max(1, targets.length);
  return { targets, complete: targets.every((t) => t.done), completion };
}

/** Target points plus, when every target is met, a bonus for the time left. */
export function scoreRound(
  evaluation: Evaluation,
  remainingFraction: number,
): number {
  const base = Math.round(evaluation.completion * MAX_TARGET_POINTS);
  const bonus = evaluation.complete
    ? Math.round(remainingFraction * MAX_TIME_BONUS)
    : 0;
  return base + bonus;
}

export function starsFor(score: number): number {
  if (score >= 125) return 3;
  if (score >= MAX_TARGET_POINTS) return 2;
  if (score >= 60) return 1;
  return 0;
}
