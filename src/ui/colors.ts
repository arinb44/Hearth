import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';

/** CSS color for a player's palette index. */
export function playerCss(colorIndex: number): string {
  const hex = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function colorDot(colorIndex: number): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = playerCss(colorIndex);
  return dot;
}
