// Friend rules shared by the module, the client, and the tests.
// Pure TypeScript: must not import spacetimedb/server.

export const MAX_FRIENDS = 50;
/** Outgoing requests still waiting for an answer, so nobody can ask every username. */
export const MAX_PENDING_REQUESTS = 20;

/**
 * The same key for (a, b) and (b, a). The module marks it unique, so two accounts
 * have at most one pending request and one friendship between them.
 */
export function friendPairKey(a: bigint, b: bigint): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** The friend's account id in a friendship row, seen from `me`. */
export function otherAccount(
  pair: { accountA: bigint; accountB: bigint },
  me: bigint,
): bigint {
  return pair.accountA === me ? pair.accountB : pair.accountA;
}
