// Round state machine. Every transition happens inside a reducer transaction, so all
// clients see one consistent phase, theme, and countdown.
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { CHALLENGES, challengeById } from './logic/challenges';
import {
  secondsToMicros,
  remainingFraction,
  type RoundTiming,
} from './logic/phases';
import { evaluateChallenge, scoreRound, starsFor } from './logic/scoring';
import type { Ctx } from './schema';

type PhaseTag = 'Lobby' | 'Building' | 'Scoring' | 'Voting' | 'Results';
type GameStateRow = ReturnType<typeof requireGameState>;

export function requireGameState(ctx: Ctx) {
  const state = ctx.db.gameState.id.find(0);
  if (!state) throw new Error('game_state singleton is missing');
  return state;
}

export function requireTiming(ctx: Ctx): RoundTiming {
  const config = ctx.db.config.id.find(0);
  if (!config) throw new Error('config singleton is missing');
  return config;
}

function onlinePlayerCount(ctx: Ctx): number {
  let count = 0;
  for (const p of ctx.db.player.iter()) if (p.online) count++;
  return count;
}

/** Moves to `phase`; with `seconds`, schedules the timer that will end it. */
function setPhase(
  ctx: Ctx,
  phase: PhaseTag,
  seconds: number | null,
  patch: Partial<GameStateRow> = {},
): void {
  const state = { ...requireGameState(ctx), ...patch };
  const endsAt = seconds
    ? new Timestamp(
        ctx.timestamp.microsSinceUnixEpoch + secondsToMicros(seconds),
      )
    : undefined;
  ctx.db.gameState.id.update({
    ...state,
    phase: { tag: phase },
    phaseStartedAt: ctx.timestamp,
    phaseEndsAt: endsAt,
  });
  if (endsAt) {
    ctx.db.phaseTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(endsAt.microsSinceUnixEpoch),
      round: state.round,
      phase: { tag: phase },
    });
  }
}

/** A timer row is current only if it matches the live round, phase, and end time. */
export function isCurrentTimer(
  ctx: Ctx,
  timer: {
    round: number;
    phase: { tag: string };
    scheduledAt: { tag: string; value: unknown };
  },
): boolean {
  const state = requireGameState(ctx);
  if (timer.round !== state.round || timer.phase.tag !== state.phase.tag)
    return false;
  if (timer.scheduledAt.tag !== 'Time' || !state.phaseEndsAt) return false;
  const firesAt = (timer.scheduledAt.value as Timestamp).microsSinceUnixEpoch;
  return firesAt === state.phaseEndsAt.microsSinceUnixEpoch;
}

/** Starts the lobby auto-start countdown if it is enabled, idle, and someone is here. */
export function ensureLobbyTimer(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const { lobbySeconds } = requireTiming(ctx);
  if (state.phase.tag !== 'Lobby' || state.phaseEndsAt || lobbySeconds === 0)
    return;
  if (onlinePlayerCount(ctx) === 0) return;
  setPhase(ctx, 'Lobby', lobbySeconds);
}

export function beginRound(ctx: Ctx): void {
  const state = requireGameState(ctx);
  // Co-op challenges rotate in order, so every round plays a different one.
  const challenge = challengeById(state.round % CHALLENGES.length);
  for (const p of [...ctx.db.piece.iter()]) ctx.db.piece.id.delete(p.id);
  setPhase(ctx, 'Building', requireTiming(ctx).buildSeconds, {
    round: state.round + 1,
    mode: { tag: 'Coop' },
    challengeId: challenge.id,
    themeTitle: challenge.title,
    host: undefined,
    teamScore: 0,
  });
}

function contributions(ctx: Ctx) {
  const pieces = new Map<string, number>();
  for (const p of ctx.db.piece.iter()) {
    const key = p.placedBy.toHexString();
    pieces.set(key, (pieces.get(key) ?? 0) + 1);
  }
  const rows = [];
  for (const p of ctx.db.player.iter()) {
    const count = pieces.get(p.identity.toHexString());
    if (count)
      rows.push({
        name: p.name,
        colorIndex: p.colorIndex,
        pieces: count,
        votes: 0,
      });
  }
  return rows.sort((a, b) => b.pieces - a.pieces);
}

/** Ends the Building phase: scores the board and records the result. */
function finishBuilding(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const timing = requireTiming(ctx);
  const board = [...ctx.db.piece.iter()];
  const evaluation = evaluateChallenge(challengeById(state.challengeId), board);
  const remaining = state.phaseEndsAt
    ? remainingFraction(
        state.phaseEndsAt.microsSinceUnixEpoch,
        ctx.timestamp.microsSinceUnixEpoch,
        timing.buildSeconds,
      )
    : 0;
  const score = scoreRound(evaluation, remaining);
  ctx.db.roundResult.insert({
    round: state.round,
    mode: state.mode,
    themeTitle: state.themeTitle,
    challengeId: state.challengeId,
    score,
    completed: evaluation.complete,
    stars: starsFor(score),
    contributions: contributions(ctx),
    endedAt: ctx.timestamp,
  });
  setPhase(ctx, 'Scoring', timing.scoringSeconds, { teamScore: score });
}

/** Called after every board change: a co-op round ends the moment it is complete. */
export function checkEarlyCompletion(ctx: Ctx): void {
  const state = requireGameState(ctx);
  if (state.phase.tag !== 'Building' || state.mode.tag !== 'Coop') return;
  const evaluation = evaluateChallenge(challengeById(state.challengeId), [
    ...ctx.db.piece.iter(),
  ]);
  if (evaluation.complete) finishBuilding(ctx);
}

/** Admin reset: empty board, back to an idle lobby. The round counter keeps going. */
export function resetToLobby(ctx: Ctx): void {
  for (const p of [...ctx.db.piece.iter()]) ctx.db.piece.id.delete(p.id);
  setPhase(ctx, 'Lobby', null, { teamScore: 0, host: undefined });
  ensureLobbyTimer(ctx);
}

/** The phase transition table, used by the phase timer and the admin skip. */
export function advance(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const timing = requireTiming(ctx);
  switch (state.phase.tag) {
    case 'Lobby':
      if (onlinePlayerCount(ctx) > 0) beginRound(ctx);
      else setPhase(ctx, 'Lobby', null);
      break;
    case 'Building':
      finishBuilding(ctx);
      break;
    case 'Scoring':
    case 'Voting':
      setPhase(ctx, 'Results', timing.resultsSeconds);
      break;
    case 'Results':
      setPhase(ctx, 'Lobby', null);
      ensureLobbyTimer(ctx);
      break;
  }
}
