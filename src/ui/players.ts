import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import type { Player } from '../module_bindings/types';

/** Top-right list of the island's online players, rebuilt from the client cache on change. */
export class PlayerList {
  private readonly root = document.getElementById('players')!;

  render(
    players: Iterable<Player>,
    myIdentityHex: string | undefined,
    islandName = 'Builders',
  ): void {
    const online = [...players]
      .filter((p) => p.online)
      .sort((a, b) => a.name.localeCompare(b.name));

    const items = online.map((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = `#${PLAYER_COLORS[
        p.colorIndex % PLAYER_COLORS.length
      ]
        .toString(16)
        .padStart(6, '0')}`;
      li.append(dot, p.name);
      if (p.identity.toHexString() === myIdentityHex) {
        const you = document.createElement('em');
        you.textContent = ' (you)';
        li.append(you);
      }
      return li;
    });

    const title = document.createElement('h2');
    // The island name is dropped on phones, where the panel only shows the count.
    const name = document.createElement('span');
    name.className = 'island-name';
    name.textContent = `${islandName} ·`;
    const count = document.createElement('span');
    count.textContent = `${online.length} online`;
    title.append(name, count);
    const list = document.createElement('ul');
    list.append(...items);
    this.root.replaceChildren(title, list);
    this.root.hidden = online.length === 0;
  }
}
