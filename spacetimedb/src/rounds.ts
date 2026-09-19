// Round state machine. Every transition happens inside a reducer transaction, so all
// clients see one consistent phase, theme, and countdown.
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';
import { CHALLENGES, challengeById } from './logic/challenges';
import {
  secondsToMicros,
  remainingFraction,
  type RoundTiming,
} from './logic/phases';
import {
  MAX_PLOTS,
  PLOT_ASSIGNMENT_ORDER,
  plotCenter,
  plotOfTile,
  plotWinners,
} from './logic/plots';
import { evaluateChallenge, scoreRound, starsFor } from './logic/scoring';
import {
  BATTLE_THEMES,
  optionKey,
  parseOptionKey,
  pickWinner,
  presetOptionKeys,
  tallyVotes,
} from './logic/themes';
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

interface RoundChoice {
  mode: 'Coop' | 'Battle';
  challengeId: number;
  themeTitle: string;
  host: Identity | undefined;
}

/** Turns the lobby vote into the next round; no votes keeps the co-op rotation. */
function chooseRound(ctx: Ctx): RoundChoice {
  const state = requireGameState(ctx);
  const ideas = [...ctx.db.idea.iter()];
  const winner = pickWinner(
    tallyVotes([...ctx.db.themeVote.iter()].map((v) => v.option)),
    [...presetOptionKeys(), ...ideas.map((i) => optionKey('idea', i.id))],
    () => ctx.random(),
  );
  const parsed = winner ? parseOptionKey(winner) : null;

  if (parsed?.kind === 'battle') {
    return {
      mode: 'Battle',
      challengeId: 0,
      themeTitle: BATTLE_THEMES[parsed.id],
      host: undefined,
    };
  }
  if (parsed?.kind === 'idea') {
    const chosen = ideas.find((i) => i.id === BigInt(parsed.id))!;
    ctx.db.idea.id.delete(chosen.id); // each idea is played once
    return {
      mode: 'Battle',
      challengeId: 0,
      themeTitle: chosen.text,
      host: chosen.author,
    };
  }
  const challenge = challengeById(
    parsed?.kind === 'challenge' ? parsed.id : state.round % CHALLENGES.length,
  );
  return {
    mode: 'Coop',
    challengeId: challenge.id,
    themeTitle: challenge.title,
    host: undefined,
  };
}

function clearRoundTables(ctx: Ctx): void {
  for (const p of [...ctx.db.piece.iter()]) ctx.db.piece.id.delete(p.id);
  for (const v of [...ctx.db.themeVote.iter()]) {
    ctx.db.themeVote.voter.delete(v.voter);
  }
  for (const p of [...ctx.db.plot.iter()])
    ctx.db.plot.builder.delete(p.builder);
  for (const v of [...ctx.db.plotVote.iter()]) {
    ctx.db.plotVote.voter.delete(v.voter);
  }
}

/** Gives each online builder (everyone but the host, up to 9) a plot and moves them there. */
function assignPlots(ctx: Ctx, host: Identity | undefined): void {
  const builders = [...ctx.db.player.iter()]
    .filter((p) => p.online && !(host && p.identity.equals(host)))
    .slice(0, MAX_PLOTS);
  builders.forEach((p, i) => {
    const plotIndex = PLOT_ASSIGNMENT_ORDER[i];
    ctx.db.plot.insert({
      builder: p.identity,
      plotIndex,
      builderName: p.name,
      colorIndex: p.colorIndex,
    });
    const center = plotCenter(plotIndex);
    ctx.db.player.identity.update({
      ...p,
      x: center.x,
      z: center.z,
      moveBudget: 0,
      lastMoveAt: ctx.timestamp,
    });
  });
}

export function beginRound(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const choice = chooseRound(ctx);
  clearRoundTables(ctx);
  if (choice.mode === 'Battle') assignPlots(ctx, choice.host);
  setPhase(ctx, 'Building', requireTiming(ctx).buildSeconds, {
    round: state.round + 1,
    mode: { tag: choice.mode },
    challengeId: choice.challengeId,
    themeTitle: choice.themeTitle,
    host: choice.host,
    teamScore: 0,
  });
}

function coopContributions(ctx: Ctx) {
  const pieces = new Map<string, number>();
  for (const p of ctx.db.piece.iter()) {
    const key = p.placedBy.toHexString();
    pieces.set(key, (pieces.get(key) ?? 0) + 1);
  }
  const rows = [];
  for (const p of ctx.db.player.iter()) {
    const count = pieces.get(p.identity.toHexString());
    if (count) {
      rows.push({
        name: p.name,
        colorIndex: p.colorIndex,
        pieces: count,
        votes: 0,
      });
    }
  }
  return rows.sort((a, b) => b.pieces - a.pieces);
}

/** Ends the Building phase: co-op rounds are scored, battle rounds move to voting. */
function finishBuilding(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const timing = requireTiming(ctx);
  if (state.mode.tag === 'Battle') {
    setPhase(ctx, 'Voting', timing.votingSeconds);
    return;
  }
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
    contributions: coopContributions(ctx),
    endedAt: ctx.timestamp,
  });
  setPhase(ctx, 'Scoring', timing.scoringSeconds, { teamScore: score });
}

/** Ends the Voting phase: tallies plot votes and records the battle result. */
function finishVoting(ctx: Ctx): void {
  const state = requireGameState(ctx);
  const plots = [...ctx.db.plot.iter()];
  const tally = new Map<number, number>(plots.map((p) => [p.plotIndex, 0]));
  for (const v of ctx.db.plotVote.iter()) {
    const current = tally.get(v.plotIndex);
    if (current !== undefined) tally.set(v.plotIndex, current + 1);
  }
  const piecesInPlot = new Map<number, number>();
  for (const p of ctx.db.piece.iter()) {
    const index = plotOfTile({ x: p.tileX, z: p.tileZ });
    if (index !== null) {
      piecesInPlot.set(index, (piecesInPlot.get(index) ?? 0) + 1);
    }
  }
  const winners = plotWinners(tally);
  const topVotes = Math.max(0, ...tally.values());
  const contributions = plots
    .map((p) => ({
      name: p.builderName,
      colorIndex: p.colorIndex,
      pieces: piecesInPlot.get(p.plotIndex) ?? 0,
      votes: tally.get(p.plotIndex) ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes || b.pieces - a.pieces);
  ctx.db.roundResult.insert({
    round: state.round,
    mode: state.mode,
    themeTitle: state.themeTitle,
    challengeId: state.challengeId,
    score: topVotes,
    completed: winners.length > 0,
    stars: 0,
    contributions,
    endedAt: ctx.timestamp,
  });
  setPhase(ctx, 'Results', requireTiming(ctx).resultsSeconds, {
    teamScore: topVotes,
  });
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

/** During a battle build: the player's plot, or null for host and spectators. */
export function buildRestriction(
  ctx: Ctx,
  who: Identity,
): number | null | undefined {
  const state = requireGameState(ctx);
  if (state.mode.tag !== 'Battle' || state.phase.tag !== 'Building') {
    return undefined;
  }
  return ctx.db.plot.builder.find(who)?.plotIndex ?? null;
}

/** Admin reset: empty board, no ideas or votes, back to an idle lobby. */
export function resetToLobby(ctx: Ctx): void {
  clearRoundTables(ctx);
  for (const i of [...ctx.db.idea.iter()]) ctx.db.idea.id.delete(i.id);
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
      setPhase(ctx, 'Results', timing.resultsSeconds);
      break;
    case 'Voting':
      finishVoting(ctx);
      break;
    case 'Results':
      setPhase(ctx, 'Lobby', null);
      ensureLobbyTimer(ctx);
      break;
  }
}
