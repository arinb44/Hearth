import {
  BUILD_NAME_MAX,
  MAX_SAVED_BUILDS,
} from '../../spacetimedb/src/logic/builds';
import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import type { DbConnection } from '../module_bindings';
import type { SavedBuild } from '../module_bindings/types';
import { myGameState, myIslandId } from '../net/queries';
import { el, errorMessage } from './dom';
import type { Toast } from './toast';

/**
 * The saved builds section of the main screen: save the board of the island you are
 * on, and load a build onto your own island between rounds. Only your own builds
 * reach this client.
 */
export class BuildsPanel {
  readonly root = el('section', { className: 'home-section' });
  private readonly heading = el('h3', {}, 'Saved builds');
  private readonly saveHint = el('p', { className: 'muted small' });
  private readonly list = el('ul', { className: 'rows' });
  private readonly form: HTMLFormElement;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    private readonly toast: Toast,
    private readonly onLoaded: () => void,
  ) {
    const input = el('input', {
      placeholder: 'Name this build',
      maxLength: BUILD_NAME_MAX,
      autocomplete: 'off',
    });
    this.form = el(
      'form',
      { className: 'home-form' },
      input,
      el('button', { type: 'submit', className: 'secondary' }, 'Save board'),
    );
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.call(conn.reducers.saveBuild({ name: input.value }), () => {
        this.toast.show(`Saved “${input.value.trim()}”`);
        input.value = '';
      });
    });
    this.root.append(this.heading, this.form, this.saveHint, this.list);

    const refresh = () => this.render();
    conn.db.savedBuild.onInsert(refresh);
    conn.db.savedBuild.onDelete(refresh);
    // Load is only offered in the lobby of your own island.
    conn.db.gameState.onUpdate((_ctx, old, row) => {
      if (old.phase.tag !== row.phase.tag) this.render();
    });
  }

  private call(action: Promise<void>, onDone?: () => void): void {
    action
      .then(onDone)
      .catch((err: unknown) => this.toast.show(errorMessage(err)));
  }

  render(): void {
    const me = [...this.conn.db.account.iter()].find(
      (a) => a.owner.toHexString() === this.myHex,
    );
    if (!me) return;
    const builds = [...this.conn.db.savedBuild.iter()].sort((a, b) =>
      Number(b.id - a.id),
    );
    this.heading.textContent = `Saved builds (${builds.length}/${MAX_SAVED_BUILDS})`;

    const islandId = myIslandId(this.conn, this.myHex);
    const island = this.conn.db.island.id.find(islandId);
    this.form.hidden = islandId === NO_ISLAND;
    this.saveHint.textContent = !island
      ? 'Enter an island to save its board.'
      : `Saves the board of ${island.name}.`;

    const ownIsland = island?.ownerAccountId === me.id;
    const inLobby = myGameState(this.conn, this.myHex)?.phase.tag === 'Lobby';
    this.list.replaceChildren(
      ...(builds.length
        ? builds.map((b) => this.row(b, ownIsland, inLobby))
        : [
            el(
              'li',
              { className: 'empty muted small' },
              'No saved builds yet.',
            ),
          ]),
    );
  }

  private row(
    build: SavedBuild,
    ownIsland: boolean,
    inLobby: boolean,
  ): HTMLLIElement {
    const actions = el('span', { className: 'actions' });
    if (ownIsland) {
      const load = el(
        'button',
        {
          type: 'button',
          className: '',
          disabled: !inLobby,
          title: inLobby ? '' : 'Builds load in the lobby, between rounds',
        },
        'Load',
      );
      load.addEventListener('click', () => {
        if (
          window.confirm(`Replace your island's board with “${build.name}”?`)
        ) {
          this.call(this.conn.reducers.loadBuild({ buildId: build.id }), () => {
            this.toast.show(`Loaded “${build.name}”`);
            this.onLoaded();
          });
        }
      });
      actions.append(load);
    }
    const remove = el(
      'button',
      { type: 'button', className: 'link' },
      'Delete',
    );
    remove.addEventListener('click', () => {
      if (window.confirm(`Delete “${build.name}”?`)) {
        this.call(this.conn.reducers.deleteBuild({ buildId: build.id }));
      }
    });
    actions.append(remove);
    return el(
      'li',
      {},
      el(
        'div',
        {},
        el('strong', {}, build.name),
        el(
          'span',
          { className: 'muted small' },
          `${build.pieces.length} pieces · ${build.createdAt
            .toDate()
            .toLocaleDateString()}`,
        ),
      ),
      actions,
    );
  }
}
