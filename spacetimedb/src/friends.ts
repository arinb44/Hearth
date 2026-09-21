// Friends: requests by username, accept / decline, and the friendships themselves.
// Re-exported from index.ts, which registers the reducers and visibility filters.
import { SenderError, t } from 'spacetimedb/server';
import { requireAccount } from './accounts';
import { parseUsername } from './logic/accounts';
import {
  friendPairKey,
  MAX_FRIENDS,
  MAX_PENDING_REQUESTS,
} from './logic/friends';
import { spacetimedb, type Ctx } from './schema';

// Each request and friendship is visible only to the two accounts in it. Filters on
// the same table are combined with OR.
export const requestSenderSees = spacetimedb.clientVisibilityFilter.sql(
  'SELECT friend_request.* FROM friend_request JOIN account ON account.id = friend_request.from_account_id WHERE account.owner = :sender',
);
export const requestRecipientSees = spacetimedb.clientVisibilityFilter.sql(
  'SELECT friend_request.* FROM friend_request JOIN account ON account.id = friend_request.to_account_id WHERE account.owner = :sender',
);
export const friendshipFirstSees = spacetimedb.clientVisibilityFilter.sql(
  'SELECT friendship.* FROM friendship JOIN account ON account.id = friendship.account_a WHERE account.owner = :sender',
);
export const friendshipSecondSees = spacetimedb.clientVisibilityFilter.sql(
  'SELECT friendship.* FROM friendship JOIN account ON account.id = friendship.account_b WHERE account.owner = :sender',
);

function friendCount(ctx: Ctx, accountId: bigint): number {
  return (
    [...ctx.db.friendship.accountA.filter(accountId)].length +
    [...ctx.db.friendship.accountB.filter(accountId)].length
  );
}

function befriend(ctx: Ctx, a: bigint, b: bigint): void {
  if (
    friendCount(ctx, a) >= MAX_FRIENDS ||
    friendCount(ctx, b) >= MAX_FRIENDS
  ) {
    throw new SenderError(
      'Friends lists hold up to ' + MAX_FRIENDS + ' people',
    );
  }
  ctx.db.friendship.insert({
    id: 0n,
    pairKey: friendPairKey(a, b),
    accountA: a < b ? a : b,
    accountB: a < b ? b : a,
    since: ctx.timestamp,
  });
}

/**
 * Asks another account (by username, ignoring case) to be friends. If they already
 * asked you, this accepts their request instead.
 */
export const sendFriendRequest = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username }) => {
    const me = requireAccount(ctx);
    const key = parseUsername(username)?.key;
    const them = key ? ctx.db.account.usernameKey.find(key) : null;
    if (!them) throw new SenderError('No player is called ' + username.trim());
    if (them.id === me.id) throw new SenderError("You can't add yourself");
    const pair = friendPairKey(me.id, them.id);
    if (ctx.db.friendship.pairKey.find(pair)) {
      throw new SenderError('You are already friends with ' + them.username);
    }
    const pending = ctx.db.friendRequest.pairKey.find(pair);
    if (pending?.fromAccountId === me.id) {
      throw new SenderError('You already asked ' + them.username);
    }
    if (pending) {
      ctx.db.friendRequest.id.delete(pending.id);
      befriend(ctx, me.id, them.id);
      return;
    }
    if (
      [...ctx.db.friendRequest.fromAccountId.filter(me.id)].length >=
      MAX_PENDING_REQUESTS
    ) {
      throw new SenderError('Too many unanswered requests; wait for replies');
    }
    ctx.db.friendRequest.insert({
      id: 0n,
      pairKey: pair,
      fromAccountId: me.id,
      toAccountId: them.id,
      createdAt: ctx.timestamp,
    });
  },
);

export const acceptFriendRequest = spacetimedb.reducer(
  { requestId: t.u64() },
  (ctx, { requestId }) => {
    const me = requireAccount(ctx);
    const request = ctx.db.friendRequest.id.find(requestId);
    if (!request || request.toAccountId !== me.id) {
      throw new SenderError('That request is gone');
    }
    ctx.db.friendRequest.id.delete(request.id);
    befriend(ctx, request.fromAccountId, me.id);
  },
);

/** The recipient declines a request, or the sender takes it back. */
export const declineFriendRequest = spacetimedb.reducer(
  { requestId: t.u64() },
  (ctx, { requestId }) => {
    const me = requireAccount(ctx);
    const request = ctx.db.friendRequest.id.find(requestId);
    if (
      !request ||
      (request.toAccountId !== me.id && request.fromAccountId !== me.id)
    ) {
      throw new SenderError('That request is gone');
    }
    ctx.db.friendRequest.id.delete(request.id);
  },
);

export const removeFriend = spacetimedb.reducer(
  { accountId: t.u64() },
  (ctx, { accountId }) => {
    const me = requireAccount(ctx);
    const friendship = ctx.db.friendship.pairKey.find(
      friendPairKey(me.id, accountId),
    );
    if (!friendship) throw new SenderError('You are not friends');
    ctx.db.friendship.id.delete(friendship.id);
  },
);
