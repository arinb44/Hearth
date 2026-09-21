// Island helpers used by the reducers in index.ts: creating islands, counting who is
// on them, and cleaning up after a player who leaves.
import type { Identity } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import { NO_ISLAND, NO_OWNER } from './logic/islands';
import type { Ctx } from './schema';

export function requireIsland(ctx: Ctx, islandId: bigint) {
  const row = ctx.db.island.id.find(islandId);
  if (!row) throw new SenderError('That island does not exist');
  return row;
}

export function mainIsland(ctx: Ctx) {
  for (const row of ctx.db.island.ownerAccountId.filter(NO_OWNER)) return row;
  throw new Error('main island is missing');
}

/** Inserts an island with its own idle lobby. */
export function createIslandRow(
  ctx: Ctx,
  name: string,
  ownerAccountId: bigint,
) {
  const created = ctx.db.island.insert({
    id: 0n,
    name,
    ownerAccountId,
    playerCount: 0,
    createdAt: ctx.timestamp,
  });
  ctx.db.gameState.insert({
    islandId: created.id,
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
  return created;
}

/** Recounts the island's online players; call after anyone arrives, leaves, or reconnects. */
export function refreshPlayerCount(ctx: Ctx, islandId: bigint): void {
  if (islandId === NO_ISLAND) return;
  const row = ctx.db.island.id.find(islandId);
  if (!row) return;
  let count = 0;
  for (const p of ctx.db.player.islandId.filter(islandId)) {
    if (p.online) count++;
  }
  if (row.playerCount !== count) {
    ctx.db.island.id.update({ ...row, playerCount: count });
  }
}

/** A player's votes only count on the island they are on. */
export function withdrawVotes(ctx: Ctx, who: Identity): void {
  ctx.db.themeVote.voter.delete(who);
  ctx.db.plotVote.voter.delete(who);
}

/** Palette indexes used by other online players on the island. */
export function colorsInUse(
  ctx: Ctx,
  islandId: bigint,
  except: Identity,
): number[] {
  const used: number[] = [];
  for (const p of ctx.db.player.islandId.filter(islandId)) {
    if (p.online && !p.identity.equals(except)) used.push(p.colorIndex);
  }
  return used;
}
