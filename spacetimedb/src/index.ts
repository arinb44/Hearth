import type { Identity } from 'spacetimedb';
import {
  schema,
  SenderError,
  t,
  table,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import { tileKey } from './logic/grid';
import { constrainMove, isFiniteVec, normalizeHeading } from './logic/movement';
import {
  BUILD_ERROR_MESSAGES,
  checkModify,
  checkPlacement,
  SERVER_REACH_SLACK,
  type BuildError,
} from './logic/pieces';
import { pickColorIndex, sanitizeName } from './logic/players';

const Phase = t.enum('Phase', ['Lobby', 'Building', 'Scoring', 'Results']);

// Singleton row (id 0) describing the shared round state.
const gameState = table(
  { name: 'game_state', public: true },
  {
    id: t.u8().primaryKey(),
    phase: Phase,
    round: t.u32(),
  },
);

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    colorIndex: t.u8(),
    online: t.bool(),
    x: t.f32(),
    z: t.f32(),
    heading: t.f32(),
    moveBudget: t.f32(),
    lastMoveAt: t.timestamp(),
  },
);

// Private: one row per live connection, so a player stays online while any tab is open.
const session = table(
  { name: 'session' },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity().index('btree'),
  },
);

// The shared board. `tileKey` is unique, so the database itself guarantees at most
// one piece per tile even when several players click the same tile at once.
const piece = table(
  { name: 'piece', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    tileKey: t.u32().unique(),
    tileX: t.u8(),
    tileZ: t.u8(),
    kind: t.string(),
    rotation: t.u8(),
    placedBy: t.identity().index('btree'),
    placedAt: t.timestamp(),
    round: t.u32(),
  },
);

// Event table: rows are broadcast to subscribers once and never stored client-side.
// Drives the activity feed and placement effects.
const activity = table(
  { name: 'activity', public: true, event: true },
  {
    kind: t.string(),
    actorName: t.string(),
    colorIndex: t.u8(),
    pieceKind: t.string(),
    tileX: t.u8(),
    tileZ: t.u8(),
  },
);

const spacetimedb = schema({ gameState, player, session, piece, activity });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type PlayerRow = ReturnType<typeof requirePlayer>;

function requireGameState(ctx: Ctx) {
  const state = ctx.db.gameState.id.find(0);
  if (!state) throw new Error('game_state singleton is missing');
  return state;
}

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
  ctx.db.gameState.insert({ id: 0, phase: { tag: 'Lobby' }, round: 0 });
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
      return;
    }
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
  },
);
