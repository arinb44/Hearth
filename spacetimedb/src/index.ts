import type { Identity } from 'spacetimedb';
import { SenderError, t } from 'spacetimedb/server';
import { tileKey } from './logic/grid';
import {
  cellKey,
  defaultIslandName,
  MAIN_ISLAND_NAME,
  MAX_ISLAND_PLAYERS,
  MAX_ISLANDS_PER_ACCOUNT,
  NO_ISLAND,
  NO_OWNER,
  parseIslandName,
  plotKey,
} from './logic/islands';
import { constrainMove, isFiniteVec, normalizeHeading } from './logic/movement';
import { DEFAULT_TIMING, isValidTiming } from './logic/phases';
import {
  BUILD_ERROR_MESSAGES,
  checkModify,
  checkPlacement,
  SERVER_REACH_SLACK,
  type BuildError,
} from './logic/pieces';
import { PLAYER_COLORS, pickColorIndex, sanitizeName } from './logic/players';
import {
  normalizeRecoveryCode,
  parseUsername,
  USERNAME_MAX,
  USERNAME_MIN,
} from './logic/accounts';
import {
  accountOf,
  addStats,
  issueRecoveryCode,
  requireAccount,
} from './accounts';
import {
  colorsInUse,
  createIslandRow,
  refreshPlayerCount,
  requireIsland,
  withdrawVotes,
} from './islands';
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
import { accountSecret, phaseTimer, spacetimedb, type Ctx } from './schema';

export default spacetimedb;

type PlayerRow = NonNullable<
  ReturnType<Ctx['db']['player']['identity']['find']>
>;

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
    islandId: actor.islandId,
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

/** The caller's player row; they must be on an island. */
function requirePlayer(ctx: Ctx): PlayerRow {
  const row = ctx.db.player.identity.find(ctx.sender);
  if (!row || row.islandId === NO_ISLAND) {
    throw new SenderError('Enter an island first');
  }
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

/** Keeps `preferred` (the account's or last color) unless someone on the island has it. */
function colorFor(
  ctx: Ctx,
  islandId: bigint,
  preferred: number | undefined,
): number {
  const used = colorsInUse(ctx, islandId, ctx.sender);
  return preferred !== undefined && !used.includes(preferred)
    ? preferred
    : pickColorIndex(used);
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
  ctx.db.config.insert({ id: 0, ...DEFAULT_TIMING });
  createIslandRow(ctx, MAIN_ISLAND_NAME, NO_OWNER);
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
    // A returning player is back on their island, with their color if it is free.
    ctx.db.player.identity.update({
      ...existing,
      online: true,
      colorIndex: colorFor(ctx, existing.islandId, existing.colorIndex),
    });
    refreshPlayerCount(ctx, existing.islandId);
    ensureLobbyTimer(ctx, existing.islandId);
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (ctx.connectionId) ctx.db.session.connectionId.delete(ctx.connectionId);
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing && existing.online && !hasSession(ctx, ctx.sender)) {
    ctx.db.player.identity.update({ ...existing, online: false });
    refreshPlayerCount(ctx, existing.islandId);
  }
});

/** Puts the caller on an island (creating their player row), spawning near the middle. */
function moveToIsland(ctx: Ctx, islandId: bigint, name: string): void {
  const target = requireIsland(ctx, islandId);
  const account = accountOf(ctx, ctx.sender);
  // Players with an account always appear under their username.
  const clean = account?.username ?? requireName(name);
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing && existing.islandId === islandId) {
    // Already here (another tab, or Play again): keep position and color.
    ctx.db.player.identity.update({ ...existing, name: clean, online: true });
    refreshPlayerCount(ctx, islandId);
    ensureLobbyTimer(ctx, islandId);
    return;
  }
  if (target.playerCount >= MAX_ISLAND_PLAYERS) {
    throw new SenderError('That island is full');
  }
  const row = {
    identity: ctx.sender,
    islandId,
    name: clean,
    colorIndex: colorFor(
      ctx,
      islandId,
      account?.colorIndex ?? existing?.colorIndex,
    ),
    online: true,
    x: (ctx.random() - 0.5) * 6,
    z: (ctx.random() - 0.5) * 6,
    heading: 0,
    moveBudget: 0,
    lastMoveAt: ctx.timestamp,
  };
  if (existing) {
    withdrawVotes(ctx, ctx.sender);
    ctx.db.player.identity.update(row);
    refreshPlayerCount(ctx, existing.islandId);
  } else {
    ctx.db.player.insert(row);
  }
  logActivity(ctx, row, 'joined');
  refreshPlayerCount(ctx, islandId);
  ensureLobbyTimer(ctx, islandId);
}

/** Enters an island; `name` is only used by guests without an account. */
export const enterIsland = spacetimedb.reducer(
  { islandId: t.u64(), name: t.string() },
  (ctx, { islandId, name }) => moveToIsland(ctx, islandId, name),
);

/** Back to the main screen: the player leaves their island. */
export const leaveIsland = spacetimedb.reducer((ctx) => {
  const me = requirePlayer(ctx);
  withdrawVotes(ctx, ctx.sender);
  ctx.db.player.identity.update({ ...me, islandId: NO_ISLAND });
  refreshPlayerCount(ctx, me.islandId);
});

/** Creates an island owned by the caller's account and takes them there. */
export const createIsland = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const account = requireAccount(ctx);
    const clean = parseIslandName(name || defaultIslandName(account.username));
    if (!clean) throw new SenderError('Island names are 3–24 characters');
    if (
      [...ctx.db.island.ownerAccountId.filter(account.id)].length >=
      MAX_ISLANDS_PER_ACCOUNT
    ) {
      throw new SenderError(
        'You can own up to ' + MAX_ISLANDS_PER_ACCOUNT + ' islands',
      );
    }
    const created = createIslandRow(ctx, clean, account.id);
    moveToIsland(ctx, created.id, account.username);
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
    const state = requireGameState(ctx, me.islandId);
    const key = tileKey(tileX, tileZ);
    const cell = cellKey(me.islandId, key);
    failIf(
      checkPlacement({
        kind,
        rotation,
        tile: { x: tileX, z: tileZ },
        phase: state.phase.tag,
        occupied: ctx.db.piece.cellKey.find(cell) !== null,
        playerPos: me,
        reachSlack: SERVER_REACH_SLACK,
        plot: buildRestriction(ctx, me.islandId, ctx.sender),
      }),
    );
    ctx.db.piece.insert({
      id: 0n,
      islandId: me.islandId,
      cellKey: cell,
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
    addStats(ctx, ctx.sender, { piecesPlaced: 1 });
    checkEarlyCompletion(ctx, me.islandId);
  },
);

function requireModifiable(ctx: Ctx, tileX: number, tileZ: number) {
  const me = requirePlayer(ctx);
  const existing = ctx.db.piece.cellKey.find(
    cellKey(me.islandId, tileKey(tileX, tileZ)),
  );
  failIf(
    checkModify({
      tile: { x: tileX, z: tileZ },
      phase: requireGameState(ctx, me.islandId).phase.tag,
      occupied: existing !== null,
      playerPos: me,
      reachSlack: SERVER_REACH_SLACK,
      plot: buildRestriction(ctx, me.islandId, ctx.sender),
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
    checkEarlyCompletion(ctx, me.islandId);
  },
);

/** Anyone on an island can start its next round from the lobby. */
export const startRound = spacetimedb.reducer((ctx) => {
  const me = requirePlayer(ctx);
  if (requireGameState(ctx, me.islandId).phase.tag !== 'Lobby') {
    throw new SenderError('A round is already running');
  }
  beginRound(ctx, me.islandId);
});

/** Fired by `phase_timer`; never callable by clients. */
export const advancePhase = spacetimedb.reducer(
  { onSchedule: phaseTimer },
  { timer: phaseTimer.rowType },
  (ctx, { timer }) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError('Phases advance on their own');
    }
    if (isCurrentTimer(ctx, timer)) advance(ctx, timer.islandId);
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

/** Admin demo control: end the island's current phase now. */
export const skipPhase = spacetimedb.reducer(
  { islandId: t.u64() },
  (ctx, { islandId }) => {
    requireAdmin(ctx);
    requireIsland(ctx, islandId);
    advance(ctx, islandId);
  },
);

/** Admin demo control: clear the island's board and return it to an idle lobby. */
export const resetGame = spacetimedb.reducer(
  { islandId: t.u64() },
  (ctx, { islandId }) => {
    requireAdmin(ctx);
    requireIsland(ctx, islandId);
    resetToLobby(ctx, islandId);
  },
);

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
      islandId: me.islandId,
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
    const me = requirePlayer(ctx);
    if (requireGameState(ctx, me.islandId).phase.tag !== 'Lobby') {
      throw new SenderError('Theme voting happens in the lobby');
    }
    const parsed = parseOptionKey(option);
    const valid =
      presetOptionKeys().includes(option) ||
      (parsed?.kind === 'idea' &&
        ctx.db.idea.id.find(BigInt(parsed.id))?.islandId === me.islandId);
    if (!valid) throw new SenderError('That option is not on the ballot');
    const vote = { voter: ctx.sender, islandId: me.islandId, option };
    if (ctx.db.themeVote.voter.find(ctx.sender)) {
      ctx.db.themeVote.voter.update(vote);
    } else {
      ctx.db.themeVote.insert(vote);
    }
  },
);

/** Build Battle vote for the best plot; you cannot vote for your own. */
export const votePlot = spacetimedb.reducer(
  { plotIndex: t.u8() },
  (ctx, { plotIndex }) => {
    const me = requirePlayer(ctx);
    if (requireGameState(ctx, me.islandId).phase.tag !== 'Voting') {
      throw new SenderError('Voting is not open');
    }
    const target = ctx.db.plot.plotKey.find(plotKey(me.islandId, plotIndex));
    if (!target) throw new SenderError('Nobody built on that plot');
    if (target.builder.equals(ctx.sender)) {
      throw new SenderError("You can't vote for your own build");
    }
    const vote = { voter: ctx.sender, islandId: me.islandId, plotIndex };
    if (ctx.db.plotVote.voter.find(ctx.sender)) {
      ctx.db.plotVote.voter.update(vote);
    } else {
      ctx.db.plotVote.insert(vote);
    }
  },
);

/** Claims a unique username for this identity and issues its first recovery code. */
export const createAccount = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username }) => {
    if (accountOf(ctx, ctx.sender)) {
      throw new SenderError('This device already has an account');
    }
    const name = parseUsername(username);
    if (!name) {
      throw new SenderError(
        'Usernames are ' +
          USERNAME_MIN +
          '–' +
          USERNAME_MAX +
          ' letters, numbers, spaces, _ or -',
      );
    }
    if (ctx.db.account.usernameKey.find(name.key)) {
      throw new SenderError('That username is taken');
    }
    const created = ctx.db.account.insert({
      id: 0n,
      owner: ctx.sender,
      username: name.display,
      usernameKey: name.key,
      colorIndex: ctx.random.integerInRange(0, PLAYER_COLORS.length - 1),
      roundsPlayed: 0,
      wins: 0,
      piecesPlaced: 0,
      createdAt: ctx.timestamp,
    });
    issueRecoveryCode(ctx, created.id);
    const playing = ctx.db.player.identity.find(ctx.sender);
    if (playing)
      ctx.db.player.identity.update({ ...playing, name: name.display });
  },
);

/**
 * Signs this device in to an existing account: the account moves to this identity
 * and the code is replaced, so each recovery code works once.
 */
export const recoverAccount = spacetimedb.reducer(
  { code: t.string() },
  (ctx, { code }) => {
    const normalized = normalizeRecoveryCode(code);
    if (!normalized) throw new SenderError('That is not a recovery code');
    const secret = ctx.db.accountSecret.recoveryCode.find(normalized);
    if (!secret) throw new SenderError('Unknown recovery code');
    const current = accountOf(ctx, ctx.sender);
    if (current && current.id !== secret.accountId) {
      throw new SenderError(
        'This device is already signed in as ' + current.username,
      );
    }
    const recovered = ctx.db.account.id.find(secret.accountId)!;
    ctx.db.account.id.update({ ...recovered, owner: ctx.sender });
    issueRecoveryCode(ctx, recovered.id);
  },
);

/** Replaces your recovery code (if the old one may have leaked). */
export const newRecoveryCode = spacetimedb.reducer((ctx) => {
  issueRecoveryCode(ctx, requireAccount(ctx).id);
});

/** Your own recovery code; every other client sees nothing here. */
export const myRecoveryCode = spacetimedb.view(
  { name: 'my_recovery_code', public: true },
  t.option(accountSecret.rowType),
  (ctx) => {
    const mine = ctx.db.account.owner.find(ctx.sender);
    return mine
      ? (ctx.db.accountSecret.accountId.find(mine.id) ?? undefined)
      : undefined;
  },
);
