// Round state machine, one per island. Every transition happens inside a reducer
// transaction, so all clients on an island see one consistent phase, theme, and countdown.
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';
import { CHALLENGES, challengeById } from './logic/challenges';
import {
  autoStartsRounds,
  NO_ISLAND,
  plotKey,
  SHARED_BOARD,
} from './logic/islands';
import { secondsToMicros, type RoundTiming } from './logic/phases';
import {
  MAX_PLOTS,
  PLOT_ASSIGNMENT_ORDER,
  plotCenter,
  plotOfTile,
  plotWinners,
} from './logic/plots';
import { scoreBoard } from './logic/scoring';
import {
  BATTLE_THEMES,
  optionKey,
  parseOptionKey,
  pickWinner,
  presetOptionKeys,
  tallyVotes,
} from './logic/themes';
import { addStats } from './accounts';
import type { Ctx } from './schema';

type PhaseTag = 'Lobby' | 'Building' | 'Scoring' | 'Voting' | 'Results';
type GameStateRow = ReturnType<typeof requireGameState>;

export function requireGameState(ctx: Ctx, islandId: bigint) {
  const state = ctx.db.gameState.islandId.find(islandId);
  if (!state) throw new Error('game_state is missing for island ' + islandId);
  return state;
}

export function requireTiming(ctx: Ctx): RoundTiming {
  const config = ctx.db.config.id.find(0);
  if (!config) throw new Error('config singleton is missing');
  return config;
}

function onlinePlayers(ctx: Ctx, islandId: bigint) {
  return [...ctx.db.player.islandId.filter(islandId)].filter((p) => p.online);
}

/** Saved stats: everyone online on the island played the round; `winners` also won it. */
function creditRound(
  ctx: Ctx,
  islandId: bigint,
  winners: (who: Identity) => boolean,
): void {
  for (const p of onlinePlayers(ctx, islandId)) {
    addStats(ctx, p.identity, {
      roundsPlayed: 1,
      wins: winners(p.identity) ? 1 : 0,
    });
  }
}

/** Moves the island to `phase`; with `seconds`, schedules the timer that will end it. */
function setPhase(
  ctx: Ctx,
  islandId: bigint,
  phase: PhaseTag,
  seconds: number | null,
  patch: Partial<GameStateRow> = {},
): void {
  const state = { ...requireGameState(ctx, islandId), ...patch };
  const endsAt = seconds
    ? new Timestamp(
        ctx.timestamp.microsSinceUnixEpoch + secondsToMicros(seconds),
      )
    : undefined;
  ctx.db.gameState.islandId.update({
    ...state,
    phase: { tag: phase },
    phaseStartedAt: ctx.timestamp,
    phaseEndsAt: endsAt,
  });
  if (endsAt) {
    ctx.db.phaseTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(endsAt.microsSinceUnixEpoch),
      islandId,
      round: state.round,
      phase: { tag: phase },
    });
  }
}

/** A timer row is current only if it matches its island's round, phase, and end time. */
export function isCurrentTimer(
  ctx: Ctx,
  timer: {
    islandId: bigint;
    round: number;
    phase: { tag: string };
    scheduledAt: { tag: string; value: unknown };
  },
): boolean {
  const state = ctx.db.gameState.islandId.find(timer.islandId);
  if (!state) return false;
  if (timer.round !== state.round || timer.phase.tag !== state.phase.tag)
    return false;
  if (timer.scheduledAt.tag !== 'Time' || !state.phaseEndsAt) return false;
  const firesAt = (timer.scheduledAt.value as Timestamp).microsSinceUnixEpoch;
  return firesAt === state.phaseEndsAt.microsSinceUnixEpoch;
}

/**
 * Starts the island's lobby countdown if it is enabled, idle, and someone is there.
 * Only the main island has one; player islands wait for someone to press Start.
 */
export function ensureLobbyTimer(ctx: Ctx, islandId: bigint): void {
  if (islandId === NO_ISLAND) return;
  const island = ctx.db.island.id.find(islandId);
  if (!island || !autoStartsRounds(island.ownerAccountId)) return;
  const state = requireGameState(ctx, islandId);
  const { lobbySeconds } = requireTiming(ctx);
  if (state.phase.tag !== 'Lobby' || state.phaseEndsAt || lobbySeconds === 0)
    return;
  if (onlinePlayers(ctx, islandId).length === 0) return;
  setPhase(ctx, islandId, 'Lobby', lobbySeconds);
}

interface RoundChoice {
  mode: 'Coop' | 'Battle';
  challengeId: number;
  themeTitle: string;
  host: Identity | undefined;
}

/** Turns the island's lobby vote into the next round; no votes keeps the co-op rotation. */
function chooseRound(ctx: Ctx, islandId: bigint): RoundChoice {
  const state = requireGameState(ctx, islandId);
  const ideas = [...ctx.db.idea.islandId.filter(islandId)];
  const winner = pickWinner(
    tallyVotes(
      [...ctx.db.themeVote.islandId.filter(islandId)].map((v) => v.option),
    ),
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

function clearRoundTables(ctx: Ctx, islandId: bigint): void {
  for (const p of [...ctx.db.piece.islandId.filter(islandId)]) {
    ctx.db.piece.id.delete(p.id);
  }
  for (const v of [...ctx.db.themeVote.islandId.filter(islandId)]) {
    ctx.db.themeVote.voter.delete(v.voter);
  }
  for (const p of [...ctx.db.plot.islandId.filter(islandId)]) {
    ctx.db.plot.id.delete(p.id);
  }
  for (const v of [...ctx.db.plotVote.islandId.filter(islandId)]) {
    ctx.db.plotVote.voter.delete(v.voter);
  }
}

/** Gives each online builder (everyone but the host, up to 9) a plot and moves them there. */
function assignPlots(
  ctx: Ctx,
  islandId: bigint,
  host: Identity | undefined,
): void {
  const builders = onlinePlayers(ctx, islandId)
    .filter((p) => !(host && p.identity.equals(host)))
    .slice(0, MAX_PLOTS);
  builders.forEach((p, i) => {
    const plotIndex = PLOT_ASSIGNMENT_ORDER[i];
    ctx.db.plot.insert({
      id: 0n,
      islandId,
      plotKey: plotKey(islandId, plotIndex),
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

export function beginRound(ctx: Ctx, islandId: bigint): void {
  const state = requireGameState(ctx, islandId);
  const choice = chooseRound(ctx, islandId);
  clearRoundTables(ctx, islandId);
  if (choice.mode === 'Battle') assignPlots(ctx, islandId, choice.host);
  setPhase(ctx, islandId, 'Building', requireTiming(ctx).buildSeconds, {
    round: state.round + 1,
    mode: { tag: choice.mode },
    challengeId: choice.challengeId,
    themeTitle: choice.themeTitle,
    host: choice.host,
    teamScore: 0,
  });
}

/** Pieces per builder on the island, named from their player row wherever they are now. */
function coopContributions(ctx: Ctx, islandId: bigint) {
  const pieces = new Map<string, { who: Identity; count: number }>();
  for (const p of ctx.db.piece.islandId.filter(islandId)) {
    const key = p.placedBy.toHexString();
    const entry = pieces.get(key) ?? { who: p.placedBy, count: 0 };
    entry.count++;
    pieces.set(key, entry);
  }
  const rows = [];
  for (const { who, count } of pieces.values()) {
    const p = ctx.db.player.identity.find(who);
    if (p) {
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

/**
 * Ends the Building phase when its time is up: co-op rounds score the shared board
 * (three stars is a win for everyone there), battle rounds move to voting.
 */
function finishBuilding(ctx: Ctx, islandId: bigint): void {
  const state = requireGameState(ctx, islandId);
  const timing = requireTiming(ctx);
  if (state.mode.tag === 'Battle') {
    setPhase(ctx, islandId, 'Voting', timing.votingSeconds);
    return;
  }
  const board = [...ctx.db.piece.islandId.filter(islandId)].filter(
    (p) => p.board === SHARED_BOARD,
  );
  const { score, stars } = scoreBoard(board);
  const won = stars === 3;
  creditRound(ctx, islandId, () => won);
  ctx.db.roundResult.insert({
    id: 0n,
    islandId,
    round: state.round,
    mode: state.mode,
    themeTitle: state.themeTitle,
    challengeId: state.challengeId,
    score,
    completed: won,
    stars,
    contributions: coopContributions(ctx, islandId),
    endedAt: ctx.timestamp,
  });
  setPhase(ctx, islandId, 'Scoring', timing.scoringSeconds, {
    teamScore: score,
  });
}

/** Ends the Voting phase: tallies plot votes and records the battle result. */
function finishVoting(ctx: Ctx, islandId: bigint): void {
  const state = requireGameState(ctx, islandId);
  const plots = [...ctx.db.plot.islandId.filter(islandId)];
  const tally = new Map<number, number>(plots.map((p) => [p.plotIndex, 0]));
  for (const v of ctx.db.plotVote.islandId.filter(islandId)) {
    const current = tally.get(v.plotIndex);
    if (current !== undefined) tally.set(v.plotIndex, current + 1);
  }
  const piecesInPlot = new Map<number, number>();
  for (const p of ctx.db.piece.islandId.filter(islandId)) {
    const index = plotOfTile({ x: p.tileX, z: p.tileZ });
    if (index !== null) {
      piecesInPlot.set(index, (piecesInPlot.get(index) ?? 0) + 1);
    }
  }
  const winners = plotWinners(tally);
  const winningBuilders = plots.filter((p) => winners.includes(p.plotIndex));
  creditRound(ctx, islandId, (who) =>
    winningBuilders.some((p) => p.builder.equals(who)),
  );
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
    id: 0n,
    islandId,
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
  setPhase(ctx, islandId, 'Results', requireTiming(ctx).resultsSeconds, {
    teamScore: topVotes,
  });
}

/** During a battle build: the player's plot, or null for host and spectators. */
export function buildRestriction(
  ctx: Ctx,
  islandId: bigint,
  who: Identity,
): number | null | undefined {
  const state = requireGameState(ctx, islandId);
  if (state.mode.tag !== 'Battle' || state.phase.tag !== 'Building') {
    return undefined;
  }
  for (const p of ctx.db.plot.builder.filter(who)) {
    if (p.islandId === islandId) return p.plotIndex;
  }
  return null;
}

/** Empty board, no ideas or votes, back to an idle lobby. */
export function resetToLobby(ctx: Ctx, islandId: bigint): void {
  clearRoundTables(ctx, islandId);
  for (const i of [...ctx.db.idea.islandId.filter(islandId)]) {
    ctx.db.idea.id.delete(i.id);
  }
  setPhase(ctx, islandId, 'Lobby', null, { teamScore: 0, host: undefined });
  ensureLobbyTimer(ctx, islandId);
}

/** The phase transition table, used by the phase timer and the admin skip. */
export function advance(ctx: Ctx, islandId: bigint): void {
  const state = requireGameState(ctx, islandId);
  const timing = requireTiming(ctx);
  switch (state.phase.tag) {
    case 'Lobby':
      if (onlinePlayers(ctx, islandId).length > 0) beginRound(ctx, islandId);
      else setPhase(ctx, islandId, 'Lobby', null);
      break;
    case 'Building':
      finishBuilding(ctx, islandId);
      break;
    case 'Scoring':
      setPhase(ctx, islandId, 'Results', timing.resultsSeconds);
      break;
    case 'Voting':
      finishVoting(ctx, islandId);
      break;
    case 'Results':
      setPhase(ctx, islandId, 'Lobby', null);
      ensureLobbyTimer(ctx, islandId);
      break;
  }
}
