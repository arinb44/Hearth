import { isPieceKind, PIECE_LABELS } from '../../spacetimedb/src/logic/pieces';
import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import type { Activity } from '../module_bindings/types';

const MAX_ITEMS = 5;
const ITEM_LIFETIME_MS = 8000;

function describe(e: Activity): string | null {
  const piece = isPieceKind(e.pieceKind)
    ? PIECE_LABELS[e.pieceKind]
    : e.pieceKind;
  switch (e.kind) {
    case 'joined':
      return 'joined the island';
    case 'placed':
      return `placed a ${piece}`;
    case 'removed':
      return `removed a ${piece}`;
    case 'idea':
      return `suggested “${e.pieceKind}”`;
    case 'loaded':
      return `loaded the build “${e.pieceKind}”`;
    default:
      return null;
  }
}

/** Recent activity, from the `activity` event table, under the status pill. */
export class ActivityFeed {
  private readonly root = document.getElementById('feed')!;

  add(event: Activity): void {
    const text = describe(event);
    if (!text) return;
    const item = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = `#${PLAYER_COLORS[
      event.colorIndex % PLAYER_COLORS.length
    ]
      .toString(16)
      .padStart(6, '0')}`;
    const name = document.createElement('strong');
    name.textContent = event.actorName;
    item.append(dot, name, ` ${text}`);
    this.root.prepend(item);
    while (this.root.children.length > MAX_ITEMS)
      this.root.lastElementChild!.remove();
    window.setTimeout(() => item.classList.add('fading'), ITEM_LIFETIME_MS);
    window.setTimeout(() => item.remove(), ITEM_LIFETIME_MS + 600);
  }
}
