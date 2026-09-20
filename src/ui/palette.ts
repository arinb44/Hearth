import {
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
};

/** Hotkey for the n-th piece: 1–9, then 0. */
export function hotkeyFor(index: number): string {
  return String((index + 1) % 10);
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
    PIECE_KINDS.forEach((kind, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${PIECE_LABELS[kind]} (${hotkeyFor(i)})`;
      button.innerHTML = `<span class="icon">${ICONS[kind]}</span><span class="label">${PIECE_LABELS[kind]}</span><kbd>${hotkeyFor(i)}</kbd>`;
      button.classList.add('piece');
      button.addEventListener('click', () => {
        onSelect(kind);
        if (COMPACT.matches) this.setCollapsed(true);
      });
      this.buttons.set(kind, button);
      this.root.append(button);
    });
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
