// Account helpers used by the reducers in index.ts and the round engine.
import type { Identity } from 'spacetimedb';
import { SenderError } from 'spacetimedb/server';
import { CODE_LENGTH, codeFromDigits } from './logic/accounts';
import type { Ctx } from './schema';

export function accountOf(ctx: Ctx, who: Identity) {
  return ctx.db.account.owner.find(who);
}

export function requireAccount(ctx: Ctx) {
  const account = accountOf(ctx, ctx.sender);
  if (!account) throw new SenderError('Create an account first');
  return account;
}

/** Stores a fresh, unused recovery code for the account, replacing any old one. */
export function issueRecoveryCode(ctx: Ctx, accountId: bigint): void {
  let code: string;
  do {
    code = codeFromDigits(
      Array.from({ length: CODE_LENGTH }, () =>
        ctx.random.integerInRange(0, 31),
      ),
    );
  } while (ctx.db.accountSecret.recoveryCode.find(code));
  if (ctx.db.accountSecret.accountId.find(accountId)) {
    ctx.db.accountSecret.accountId.update({ accountId, recoveryCode: code });
  } else {
    ctx.db.accountSecret.insert({ accountId, recoveryCode: code });
  }
}

interface StatChange {
  roundsPlayed?: number;
  wins?: number;
  piecesPlaced?: number;
}

/** Adds to a player's saved stats; players without an account are skipped. */
export function addStats(ctx: Ctx, who: Identity, change: StatChange): void {
  const account = accountOf(ctx, who);
  if (!account) return;
  ctx.db.account.id.update({
    ...account,
    roundsPlayed: account.roundsPlayed + (change.roundsPlayed ?? 0),
    wins: account.wins + (change.wins ?? 0),
    piecesPlaced: account.piecesPlaced + (change.piecesPlaced ?? 0),
  });
}
