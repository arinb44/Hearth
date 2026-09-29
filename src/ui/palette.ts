import {
  PIECE_CATEGORIES,
  PIECE_KINDS,
  PIECE_LABELS,
  type PieceKind,
} from '../../spacetimedb/src/logic/pieces';
import { COMPACT } from './layout';

const ICONS: Record<PieceKind, string> = {
  house: '🏠',
  tree: '🌳',
  pine: '🌲',
  rock: '🪨',
  path: '🟫',
  flowers: '🌷',
  fence: '🚧',
  well: '⛲',
  lamp: '💡',
  tower: '🏰',
  water: '💧',
  tile: '⬜',
  bridge: '🌉',
  grass: '🌿',
  fireflies: '✨',
  bench: '🪑',
  wall: '🧱',
};

/** Hotkey for the n-th piece in PIECE_KINDS: 1–9, then 0; later pieces have none. */
export function hotkeyFor(index: number): string | null {
  return index < 10 ? String((index + 1) % 10) : null;
}

export interface PaletteTools {
  onRotate(): void;
  onToggleRemove(): void;
}

function toolButton(
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.innerHTML = `<span class="icon">${icon}</span><span class="label">${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Bottom bar of piece buttons; the selected piece is highlighted. With `tools` (touch
 * devices, which have no right-click or R key) it also gets Turn and Remove buttons.
 * The first button collapses the piece list to just the current piece; compact
 * layouts start collapsed and close again after a pick.
 */
export class Palette {
  private readonly root = document.getElementById('palette')!;
  private readonly buttons = new Map<PieceKind, HTMLButtonElement>();
  private readonly removeButton: HTMLButtonElement | null = null;
  private readonly toggle: HTMLButtonElement;
  private readonly groupOf = new Map<PieceKind, HTMLElement>();

  constructor(onSelect: (kind: PieceKind) => void, tools?: PaletteTools) {
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'toggle';
    this.toggle.title = 'Show or hide pieces';
    this.toggle.addEventListener('click', () =>
      this.setCollapsed(!this.collapsed),
    );
    this.root.append(this.toggle);
    this.setCollapsed(COMPACT.matches);

    if (tools) {
      this.removeButton = toolButton('🗑️', 'Remove', tools.onToggleRemove);
      this.root.append(
        toolButton('🔄', 'Turn', tools.onRotate),
        this.removeButton,
      );
    }
    // One section per category. Sections fold into a single button; opening one
    // closes the others, so only one row of pieces is ever on screen.
    for (const category of PIECE_CATEGORIES) {
      const group = document.createElement('div');
      group.className = 'group';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'group-head';
      head.innerHTML = `<span class="icon">${ICONS[category.kinds[0]]}</span><span class="label">${category.name}</span>`;
      head.addEventListener('click', () =>
        this.openGroup(group.classList.contains('open') ? null : group),
      );
      const row = document.createElement('div');
      row.className = 'row';
      for (const kind of category.kinds) {
        row.append(this.pieceButton(kind, onSelect));
        this.groupOf.set(kind, group);
      }
      group.append(head, row);
      this.root.append(group);
    }
  }

  private openGroup(open: HTMLElement | null): void {
    for (const group of this.root.querySelectorAll('.group')) {
      group.classList.toggle('open', group === open);
    }
  }

  private pieceButton(
    kind: PieceKind,
    onSelect: (kind: PieceKind) => void,
  ): HTMLButtonElement {
    const hotkey = hotkeyFor(PIECE_KINDS.indexOf(kind));
    const button = document.createElement('button');
    button.type = 'button';
    button.title = hotkey
      ? `${PIECE_LABELS[kind]} (${hotkey})`
      : PIECE_LABELS[kind];
    button.innerHTML = `<span class="icon">${ICONS[kind]}</span><span class="label">${PIECE_LABELS[kind]}</span>${hotkey ? `<kbd>${hotkey}</kbd>` : ''}`;
    button.classList.add('piece');
    button.addEventListener('click', () => {
      onSelect(kind);
      if (COMPACT.matches) this.setCollapsed(true);
    });
    this.buttons.set(kind, button);
    return button;
  }

  private get collapsed(): boolean {
    return this.root.classList.contains('collapsed');
  }

  private setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
    this.toggle.dataset.open = String(!collapsed);
  }

  setSelected(kind: PieceKind): void {
    for (const [k, button] of this.buttons)
      button.classList.toggle('selected', k === kind);
    this.openGroup(this.groupOf.get(kind) ?? null);
    this.toggle.innerHTML = `<span class="icon">${ICONS[kind]}</span><span class="label">${PIECE_LABELS[kind]}</span>`;
  }

  setRemoveMode(on: boolean): void {
    this.removeButton?.classList.toggle('selected', on);
    for (const button of this.buttons.values()) {
      button.classList.toggle('dimmed', on);
    }
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
