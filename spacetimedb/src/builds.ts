// Saved builds: snapshots of an island's board kept on an account, which the owner can
// load back onto their own island between rounds. Re-exported from index.ts.
import { SenderError, t } from 'spacetimedb/server';
import { requireAccount } from './accounts';
import { requireIsland, requirePlayer } from './islands';
import {
  MAX_SAVED_BUILDS,
  parseBuildName,
  placeablePieces,
} from './logic/builds';
import { tileKey } from './logic/grid';
import { cellKey, SHARED_BOARD } from './logic/islands';
import { layerOf } from './logic/pieces';
import { battleBoard, requireGameState } from './rounds';
import { spacetimedb, type Ctx } from './schema';

// Only the owner sees their builds; nobody else downloads them.
export const buildOwnerSees = spacetimedb.clientVisibilityFilter.sql(
  'SELECT saved_build.* FROM saved_build JOIN account ON account.id = saved_build.owner_account_id WHERE account.owner = :sender',
);

function requireOwnBuild(ctx: Ctx, buildId: bigint) {
  const account = requireAccount(ctx);
  const build = ctx.db.savedBuild.id.find(buildId);
  if (!build || build.ownerAccountId !== account.id) {
    throw new SenderError('That build is gone');
  }
  return { account, build };
}

/**
 * Saves the board you see on the island you are on (any island) to your account:
 * your own build during a battle round, otherwise the island's shared board.
 */
export const saveBuild = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const account = requireAccount(ctx);
    const me = requirePlayer(ctx);
    const clean = parseBuildName(name);
    if (!clean) throw new SenderError('Give the build a name');
    if (
      [...ctx.db.savedBuild.ownerAccountId.filter(account.id)].length >=
      MAX_SAVED_BUILDS
    ) {
      throw new SenderError(
        'You can keep up to ' + MAX_SAVED_BUILDS + ' builds; delete one first',
      );
    }
    const state = requireGameState(ctx, me.islandId);
    const inBattle = state.mode.tag === 'Battle' && state.phase.tag !== 'Lobby';
    const board =
      (inBattle && battleBoard(ctx, me.islandId, ctx.sender)) || SHARED_BOARD;
    const pieces = [...ctx.db.piece.islandId.filter(me.islandId)]
      .filter((p) => p.board === board)
      .sort((a, b) => a.tileKey - b.tileKey || a.layer - b.layer)
      .map(({ kind, tileX, tileZ, rotation }) => ({
        kind,
        tileX,
        tileZ,
        rotation,
      }));
    if (pieces.length === 0) {
      throw new SenderError('The board is empty; build something first');
    }
    ctx.db.savedBuild.insert({
      id: 0n,
      ownerAccountId: account.id,
      name: clean,
      pieces,
      createdAt: ctx.timestamp,
    });
  },
);

/** Replaces your island's board with a saved build; only in the lobby, between rounds. */
export const loadBuild = spacetimedb.reducer(
  { buildId: t.u64() },
  (ctx, { buildId }) => {
    const { account, build } = requireOwnBuild(ctx, buildId);
    const me = requirePlayer(ctx);
    if (requireIsland(ctx, me.islandId).ownerAccountId !== account.id) {
      throw new SenderError('Builds load only on your own island');
    }
    const state = requireGameState(ctx, me.islandId);
    if (state.phase.tag !== 'Lobby') {
      throw new SenderError('Builds load in the lobby, between rounds');
    }
    for (const p of [...ctx.db.piece.islandId.filter(me.islandId)]) {
      ctx.db.piece.id.delete(p.id);
    }
    for (const p of placeablePieces(build.pieces)) {
      const key = tileKey(p.tileX, p.tileZ);
      const layer = layerOf(p.kind);
      ctx.db.piece.insert({
        id: 0n,
        islandId: me.islandId,
        board: SHARED_BOARD,
        layer,
        cellKey: cellKey(me.islandId, key, layer),
        tileKey: key,
        tileX: p.tileX,
        tileZ: p.tileZ,
        kind: p.kind,
        rotation: p.rotation,
        placedBy: ctx.sender,
        placedAt: ctx.timestamp,
        round: state.round,
      });
    }
    ctx.db.activity.insert({
      islandId: me.islandId,
      board: SHARED_BOARD,
      kind: 'loaded',
      actorName: me.name,
      colorIndex: me.colorIndex,
      pieceKind: build.name,
      tileX: 0,
      tileZ: 0,
    });
  },
);

export const deleteBuild = spacetimedb.reducer(
  { buildId: t.u64() },
  (ctx, { buildId }) => {
    ctx.db.savedBuild.id.delete(requireOwnBuild(ctx, buildId).build.id);
  },
);
