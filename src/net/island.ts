import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import { tables, type DbConnection } from '../module_bindings';

type Handle = ReturnType<
  ReturnType<DbConnection['subscriptionBuilder']>['subscribe']
>;

/**
 * Keeps the client subscribed to exactly one island's rows. Switching islands
 * unsubscribes the old island first, so its rows leave the cache (firing onDelete)
 * before the new island's rows arrive (firing onInsert).
 */
export class IslandSubscription {
  private handle: Handle | null = null;
  current = NO_ISLAND;

  constructor(
    private readonly conn: DbConnection,
    private readonly onError: (message: string) => void,
  ) {}

  switchTo(islandId: bigint): void {
    if (islandId === this.current) return;
    this.current = islandId;
    this.handle?.unsubscribe();
    this.handle = null;
    if (islandId === NO_ISLAND) return;
    const id = islandId;
    this.handle = this.conn
      .subscriptionBuilder()
      .onError(() => this.onError('Could not load the island'))
      .subscribe([
        tables.gameState.where((r) => r.islandId.eq(id)),
        tables.player.where((r) => r.islandId.eq(id)),
        tables.piece.where((r) => r.islandId.eq(id)),
        tables.roundResult.where((r) => r.islandId.eq(id)),
        tables.activity.where((r) => r.islandId.eq(id)),
        tables.idea.where((r) => r.islandId.eq(id)),
        tables.themeVote.where((r) => r.islandId.eq(id)),
        tables.plot.where((r) => r.islandId.eq(id)),
        tables.plotVote.where((r) => r.islandId.eq(id)),
      ]);
  }
}
