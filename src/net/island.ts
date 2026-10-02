import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import { tables, type DbConnection } from '../module_bindings';

type Handle = ReturnType<
  ReturnType<DbConnection['subscriptionBuilder']>['subscribe']
>;

/**
 * Keeps the client subscribed to exactly one island's rows. Switching islands
 * unsubscribes the old island first, so its rows leave the cache (firing onDelete)
 * before the new island's rows arrive (firing onInsert).
 *
 * Pieces have their own query, so it can narrow to one board: while a battle is built
 * the client receives only its own private board, and the others arrive for the
 * showcase.
 */
export class IslandSubscription {
  private handle: Handle | null = null;
  /** Live piece queries; a swap keeps the old one until the new one is applied. */
  private readonly pieceHandles = new Set<Handle>();
  private pieceBoard: number | null = null;
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
    for (const h of [...this.pieceHandles]) this.drop(h);
    if (islandId === NO_ISLAND) return;
    const id = islandId;
    this.handle = this.conn
      .subscriptionBuilder()
      .onError(() => this.onError('Could not load the island'))
      .subscribe([
        tables.gameState.where((r) => r.islandId.eq(id)),
        tables.player.where((r) => r.islandId.eq(id)),
        tables.roundResult.where((r) => r.islandId.eq(id)),
        tables.activity.where((r) => r.islandId.eq(id)),
        tables.idea.where((r) => r.islandId.eq(id)),
        tables.themeVote.where((r) => r.islandId.eq(id)),
        tables.plot.where((r) => r.islandId.eq(id)),
        tables.plotVote.where((r) => r.islandId.eq(id)),
      ]);
    this.pieceBoard = null;
    this.subscribePieces();
  }

  /** Receives only one board's pieces (a private battle build), or null for all. */
  showBoard(board: number | null): void {
    if (this.current === NO_ISLAND || board === this.pieceBoard) return;
    this.pieceBoard = board;
    this.subscribePieces();
  }

  private subscribePieces(): void {
    const id = this.current;
    const board = this.pieceBoard;
    const previous = [...this.pieceHandles];
    const handle = this.conn
      .subscriptionBuilder()
      .onApplied(() => previous.forEach((h) => this.drop(h)))
      .onError(() => this.onError('Could not load the board'))
      .subscribe(
        board === null
          ? tables.piece.where((r) => r.islandId.eq(id))
          : tables.piece
              .where((r) => r.islandId.eq(id))
              .where((r) => r.board.eq(board)),
      );
    this.pieceHandles.add(handle);
  }

  private drop(handle: Handle): void {
    if (!this.pieceHandles.delete(handle)) return;
    handle.unsubscribe();
  }
}
