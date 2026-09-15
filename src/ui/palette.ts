import {
  PIECE_KINDS,
  PIECE_LABELS,
  type PieceKind,
} from '../../spacetimedb/src/logic/pieces';

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
};

/** Hotkey for the n-th piece: 1–9, then 0. */
export function hotkeyFor(index: number): string {
  return String((index + 1) % 10);
}

/** Bottom bar of piece buttons; the selected piece is highlighted. */
export class Palette {
  private readonly root = document.getElementById('palette')!;
  private readonly buttons = new Map<PieceKind, HTMLButtonElement>();

  constructor(onSelect: (kind: PieceKind) => void) {
    PIECE_KINDS.forEach((kind, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${PIECE_LABELS[kind]} (${hotkeyFor(i)})`;
      button.innerHTML = `<span class="icon">${ICONS[kind]}</span><span class="label">${PIECE_LABELS[kind]}</span><kbd>${hotkeyFor(i)}</kbd>`;
      button.addEventListener('click', () => onSelect(kind));
      this.buttons.set(kind, button);
      this.root.append(button);
    });
  }

  setSelected(kind: PieceKind): void {
    for (const [k, button] of this.buttons)
      button.classList.toggle('selected', k === kind);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
