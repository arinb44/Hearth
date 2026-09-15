import type { Identity } from 'spacetimedb';
import {
  schema,
  SenderError,
  t,
  table,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import { constrainMove, isFiniteVec, normalizeHeading } from './logic/movement';
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

const spacetimedb = schema({ gameState, player, session });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

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
    ctx.db.player.insert({
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
