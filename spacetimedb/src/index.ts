import type { Identity } from 'spacetimedb';
import { SenderError, t } from 'spacetimedb/server';
import { tileKey } from './logic/grid';
import { constrainMove, isFiniteVec, normalizeHeading } from './logic/movement';
import { DEFAULT_TIMING, isValidTiming } from './logic/phases';
import {
  BUILD_ERROR_MESSAGES,
  checkModify,
  checkPlacement,
  SERVER_REACH_SLACK,
  type BuildError,
} from './logic/pieces';
import { pickColorIndex, sanitizeName } from './logic/players';
import {
  optionKey,
  parseOptionKey,
  presetOptionKeys,
  sanitizeIdea,
} from './logic/themes';
import {
  advance,
  beginRound,
  buildRestriction,
  checkEarlyCompletion,
  ensureLobbyTimer,
  isCurrentTimer,
  requireGameState,
  resetToLobby,
} from './rounds';
import { phaseTimer, spacetimedb, type Ctx } from './schema';

export default spacetimedb;

type PlayerRow = ReturnType<typeof requirePlayer>;

function failIf(error: BuildError | null): void {
  if (error) throw new SenderError(BUILD_ERROR_MESSAGES[error]);
}

function logActivity(
  ctx: Ctx,
  actor: PlayerRow,
  kind: string,
  pieceKind = '',
  tileX = 0,
  tileZ = 0,
): void {
  ctx.db.activity.insert({
    kind,
    actorName: actor.name,
    colorIndex: actor.colorIndex,
    pieceKind,
    tileX,
    tileZ,
  });
}

function requireName(raw: string): string {
  const name = sanitizeName(raw);
  if (!name) throw new SenderError('Name must contain a visible character');
  return name;
}

function requirePlayer(ctx: Ctx) {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row) throw new SenderError('Join the game first');
  return row;
}

function requireAdmin(ctx: Ctx): void {
  if (!ctx.db.admin.identity.find(ctx.sender)) {
    throw new SenderError('Only the admin can do that');
  }
}

function hasSession(ctx: Ctx, identity: Identity): boolean {
  for (const _ of ctx.db.session.identity.filter(identity)) return true;
  return false;
}

function colorsInUse(ctx: Ctx, except: Identity): number[] {
  const used: number[] = [];
  for (const p of ctx.db.player.iter()) {
    if (p.online && !p.identity.equals(except)) used.push(p.colorIndex);
  }
  return used;
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
  ctx.db.config.insert({ id: 0, ...DEFAULT_TIMING });
  ctx.db.gameState.insert({
    id: 0,
    phase: { tag: 'Lobby' },
    mode: { tag: 'Coop' },
    round: 0,
    themeTitle: '',
    challengeId: 0,
    host: undefined,
    phaseStartedAt: ctx.timestamp,
    phaseEndsAt: undefined,
    teamScore: 0,
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  if (ctx.connectionId) {
    ctx.db.session.insert({
      connectionId: ctx.connectionId,
      identity: ctx.sender,
    });
  }
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing && !existing.online) {
    // A returning player keeps their color unless someone online has taken it.
    const used = colorsInUse(ctx, ctx.sender);
    const colorIndex = used.includes(existing.colorIndex)
      ? pickColorIndex(used)
      : existing.colorIndex;
    ctx.db.player.identity.update({ ...existing, online: true, colorIndex });
    ensureLobbyTimer(ctx);
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (ctx.connectionId) ctx.db.session.connectionId.delete(ctx.connectionId);
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing && existing.online && !hasSession(ctx, ctx.sender)) {
    ctx.db.player.identity.update({ ...existing, online: false });
  }
});

export const join = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const clean = requireName(name);
    const existing = ctx.db.player.identity.find(ctx.sender);
    if (existing) {
      ctx.db.player.identity.update({ ...existing, name: clean, online: true });
    } else {
      const created = ctx.db.player.insert({
        identity: ctx.sender,
        name: clean,
        colorIndex: pickColorIndex(colorsInUse(ctx, ctx.sender)),
        online: true,
        x: (ctx.random() - 0.5) * 6,
        z: (ctx.random() - 0.5) * 6,
        heading: 0,
        moveBudget: 0,
        lastMoveAt: ctx.timestamp,
      });
      logActivity(ctx, created, 'joined');
    }
    ensureLobbyTimer(ctx);
  },
);

export const setName = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const existing = requirePlayer(ctx);
    ctx.db.player.identity.update({ ...existing, name: requireName(name) });
  },
);

export const move = spacetimedb.reducer(
  { x: t.f32(), z: t.f32(), heading: t.f32() },
  (ctx, { x, z, heading }) => {
    const existing = requirePlayer(ctx);
    if (!isFiniteVec({ x, z }) || !Number.isFinite(heading)) {
      throw new SenderError('Invalid position');
    }
    const dtSeconds =
      Number(
        ctx.timestamp.microsSinceUnixEpoch -
          existing.lastMoveAt.microsSinceUnixEpoch,
      ) / 1_000_000;
    const { pos, budget } = constrainMove(
      { x: existing.x, z: existing.z },
      { x, z },
      existing.moveBudget,
      dtSeconds,
    );
    ctx.db.player.identity.update({
      ...existing,
      x: pos.x,
      z: pos.z,
      heading: normalizeHeading(heading),
      moveBudget: budget,
      lastMoveAt: ctx.timestamp,
    });
  },
);

export const placePiece = spacetimedb.reducer(
  { kind: t.string(), tileX: t.u8(), tileZ: t.u8(), rotation: t.u8() },
  (ctx, { kind, tileX, tileZ, rotation }) => {
    const me = requirePlayer(ctx);
    const state = requireGameState(ctx);
    const key = tileKey(tileX, tileZ);
    failIf(
      checkPlacement({
        kind,
        rotation,
        tile: { x: tileX, z: tileZ },
        phase: state.phase.tag,
        occupied: ctx.db.piece.tileKey.find(key) !== null,
        playerPos: me,
        reachSlack: SERVER_REACH_SLACK,
        plot: buildRestriction(ctx, ctx.sender),
      }),
    );
    ctx.db.piece.insert({
      id: 0n,
      tileKey: key,
      tileX,
      tileZ,
      kind,
      rotation,
      placedBy: ctx.sender,
      placedAt: ctx.timestamp,
      round: state.round,
    });
    logActivity(ctx, me, 'placed', kind, tileX, tileZ);
    checkEarlyCompletion(ctx);
  },
);

function requireModifiable(ctx: Ctx, tileX: number, tileZ: number) {
  const me = requirePlayer(ctx);
  const existing = ctx.db.piece.tileKey.find(tileKey(tileX, tileZ));
  failIf(
    checkModify({
      tile: { x: tileX, z: tileZ },
      phase: requireGameState(ctx).phase.tag,
      occupied: existing !== null,
      playerPos: me,
      reachSlack: SERVER_REACH_SLACK,
      plot: buildRestriction(ctx, ctx.sender),
    }),
  );
  return { me, existing: existing! };
}

export const rotatePiece = spacetimedb.reducer(
  { tileX: t.u8(), tileZ: t.u8() },
  (ctx, { tileX, tileZ }) => {
    const { existing } = requireModifiable(ctx, tileX, tileZ);
    ctx.db.piece.id.update({
      ...existing,
      rotation: (existing.rotation + 1) % 4,
    });
  },
);

export const removePiece = spacetimedb.reducer(
  { tileX: t.u8(), tileZ: t.u8() },
  (ctx, { tileX, tileZ }) => {
    const { me, existing } = requireModifiable(ctx, tileX, tileZ);
    ctx.db.piece.id.delete(existing.id);
    logActivity(ctx, me, 'removed', existing.kind, tileX, tileZ);
    checkEarlyCompletion(ctx);
  },
);

/** Any joined player can start the next round from the lobby. */
export const startRound = spacetimedb.reducer((ctx) => {
  requirePlayer(ctx);
  if (requireGameState(ctx).phase.tag !== 'Lobby') {
    throw new SenderError('A round is already running');
  }
  beginRound(ctx);
});

/** Fired by `phase_timer`; never callable by clients. */
export const advancePhase = spacetimedb.reducer(
  { onSchedule: phaseTimer },
  { timer: phaseTimer.rowType },
  (ctx, { timer }) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError('Phases advance on their own');
    }
    if (isCurrentTimer(ctx, timer)) advance(ctx);
  },
);

export const configureTiming = spacetimedb.reducer(
  {
    lobbySeconds: t.u32(),
    buildSeconds: t.u32(),
    scoringSeconds: t.u32(),
    votingSeconds: t.u32(),
    resultsSeconds: t.u32(),
  },
  (ctx, timing) => {
    requireAdmin(ctx);
    if (!isValidTiming(timing)) throw new SenderError('Invalid timing');
    ctx.db.config.id.update({ id: 0, ...timing });
  },
);

/** Admin demo control: end the current phase now. */
export const skipPhase = spacetimedb.reducer((ctx) => {
  requireAdmin(ctx);
  advance(ctx);
});

/** Admin demo control: clear the board and return to an idle lobby. */
export const resetGame = spacetimedb.reducer((ctx) => {
  requireAdmin(ctx);
  resetToLobby(ctx);
});

/** One build idea per player; it becomes a theme-vote option for everyone. */
export const submitIdea = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    const me = requirePlayer(ctx);
    const clean = sanitizeIdea(text);
    if (!clean) throw new SenderError('Type an idea first');
    const previous = ctx.db.idea.author.find(ctx.sender);
    if (previous) {
      // Replacing an idea withdraws the old one, along with its votes.
      ctx.db.idea.id.delete(previous.id);
      const oldKey = optionKey('idea', previous.id);
      for (const v of [...ctx.db.themeVote.iter()]) {
        if (v.option === oldKey) ctx.db.themeVote.voter.delete(v.voter);
      }
    }
    ctx.db.idea.insert({
      id: 0n,
      author: ctx.sender,
      authorName: me.name,
      text: clean,
      createdAt: ctx.timestamp,
    });
    logActivity(ctx, me, 'idea', clean);
  },
);

/** Lobby vote for the next round's theme; voting again changes your vote. */
export const voteTheme = spacetimedb.reducer(
  { option: t.string() },
  (ctx, { option }) => {
    requirePlayer(ctx);
    if (requireGameState(ctx).phase.tag !== 'Lobby') {
      throw new SenderError('Theme voting happens in the lobby');
    }
    const parsed = parseOptionKey(option);
    const valid =
      presetOptionKeys().includes(option) ||
      (parsed?.kind === 'idea' &&
        ctx.db.idea.id.find(BigInt(parsed.id)) !== null);
    if (!valid) throw new SenderError('That option is not on the ballot');
    const existing = ctx.db.themeVote.voter.find(ctx.sender);
    if (existing) ctx.db.themeVote.voter.update({ ...existing, option });
    else ctx.db.themeVote.insert({ voter: ctx.sender, option });
  },
);

/** Build Battle vote for the best plot; you cannot vote for your own. */
export const votePlot = spacetimedb.reducer(
  { plotIndex: t.u8() },
  (ctx, { plotIndex }) => {
    requirePlayer(ctx);
    if (requireGameState(ctx).phase.tag !== 'Voting') {
      throw new SenderError('Voting is not open');
    }
    const target = ctx.db.plot.plotIndex.find(plotIndex);
    if (!target) throw new SenderError('Nobody built on that plot');
    if (target.builder.equals(ctx.sender)) {
      throw new SenderError("You can't vote for your own build");
    }
    const existing = ctx.db.plotVote.voter.find(ctx.sender);
    if (existing) ctx.db.plotVote.voter.update({ ...existing, plotIndex });
    else ctx.db.plotVote.insert({ voter: ctx.sender, plotIndex });
  },
);
