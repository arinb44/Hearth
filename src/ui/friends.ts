import { USERNAME_MAX } from '../../spacetimedb/src/logic/accounts';
import { otherAccount } from '../../spacetimedb/src/logic/friends';
import {
  MAX_ISLAND_PLAYERS,
  NO_ISLAND,
} from '../../spacetimedb/src/logic/islands';
import type { DbConnection } from '../module_bindings';
import type { Account } from '../module_bindings/types';
import { myIslandId } from '../net/queries';
import { el, errorMessage } from './dom';
import type { Toast } from './toast';

/**
 * The friends section of the main screen: add someone by username, answer requests,
 * and see where each friend is, with a Join button. Requests and friendships reach
 * this client only if it is one of the two accounts involved; presence comes from
 * the friend's public account row.
 */
export class FriendsPanel {
  readonly root = el('section', { className: 'home-section' });
  // Re-rendered on its own, so live presence never wipes a half-typed username.
  private readonly list = el('ul', { className: 'rows' });

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    private readonly toast: Toast,
    private readonly join: (
      islandId: bigint,
      button: HTMLButtonElement,
    ) => void,
  ) {
    const input = el('input', {
      placeholder: 'Friend’s username',
      maxLength: USERNAME_MAX,
      autocomplete: 'off',
    });
    const form = el(
      'form',
      { className: 'home-form' },
      input,
      el('button', { type: 'submit', className: 'secondary' }, 'Add friend'),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      this.call(
        conn.reducers.sendFriendRequest({ username: input.value }),
        () => (input.value = ''),
      );
    });
    this.root.append(form, this.list);

    const refresh = () => this.render();
    for (const table of [conn.db.friendRequest, conn.db.friendship]) {
      table.onInsert(refresh);
      table.onDelete(refresh);
    }
  }

  private call(action: Promise<void>, onDone?: () => void): void {
    action
      .then(onDone)
      .catch((err: unknown) => this.toast.show(errorMessage(err)));
  }

  private button(
    label: string,
    className: string,
    onClick: (button: HTMLButtonElement) => void,
  ): HTMLButtonElement {
    const button = el('button', { type: 'button', className }, label);
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  private row(
    title: string,
    detail: string,
    ...actions: HTMLElement[]
  ): HTMLLIElement {
    return el(
      'li',
      {},
      el(
        'div',
        {},
        el('strong', {}, title),
        el('span', { className: 'muted small' }, detail),
      ),
      el('span', { className: 'actions' }, ...actions),
    );
  }

  /** Requests first (yours to answer, then sent), then friends: playing, online, offline. */
  render(): void {
    const accounts = new Map(
      [...this.conn.db.account.iter()].map((a) => [a.id, a]),
    );
    const me = [...accounts.values()].find(
      (a) => a.owner.toHexString() === this.myHex,
    );
    if (!me) return;
    const nameOf = (id: bigint) => accounts.get(id)?.username ?? 'Someone';
    const requests = [...this.conn.db.friendRequest.iter()];

    const incoming = requests
      .filter((r) => r.toAccountId === me.id)
      .map((r) =>
        this.row(
          nameOf(r.fromAccountId),
          'Wants to be friends',
          this.button('Accept', '', () =>
            this.call(
              this.conn.reducers.acceptFriendRequest({ requestId: r.id }),
            ),
          ),
          this.button('Decline', 'link', () =>
            this.call(
              this.conn.reducers.declineFriendRequest({ requestId: r.id }),
            ),
          ),
        ),
      );
    const sent = requests
      .filter((r) => r.fromAccountId === me.id)
      .map((r) =>
        this.row(
          nameOf(r.toAccountId),
          'Request sent',
          this.button('Cancel', 'link', () =>
            this.call(
              this.conn.reducers.declineFriendRequest({ requestId: r.id }),
            ),
          ),
        ),
      );

    const here = myIslandId(this.conn, this.myHex);
    const rank = (a: Account) =>
      !a.online ? 2 : a.islandId === NO_ISLAND ? 1 : 0;
    const friends = [...this.conn.db.friendship.iter()]
      .map((f) => accounts.get(otherAccount(f, me.id)))
      .filter((a): a is Account => a !== undefined)
      .sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username))
      .map((friend) => this.friendRow(friend, here));

    const rows = [...incoming, ...sent, ...friends];
    this.list.replaceChildren(
      ...(rows.length
        ? rows
        : [
            el(
              'li',
              { className: 'empty muted small' },
              'No friends yet. Add someone by their username.',
            ),
          ]),
    );
  }

  private friendRow(friend: Account, here: bigint): HTMLLIElement {
    const island = this.conn.db.island.id.find(friend.islandId);
    const detail = !friend.online
      ? 'Offline'
      : !island
        ? 'Online · on the main screen'
        : island.id === here
          ? 'Here with you on ' + island.name
          : 'On ' + island.name;
    const actions: HTMLElement[] = [];
    if (friend.online && island && island.id !== here) {
      const full = island.playerCount >= MAX_ISLAND_PLAYERS;
      const join = this.button(full ? 'Full' : 'Join', '', (b) =>
        this.join(island.id, b),
      );
      join.disabled = full;
      actions.push(join);
    }
    actions.push(
      this.button('Remove', 'link', () => {
        if (window.confirm(`Remove ${friend.username} from your friends?`)) {
          this.call(this.conn.reducers.removeFriend({ accountId: friend.id }));
        }
      }),
    );
    const row = this.row(friend.username, detail, ...actions);
    row.prepend(
      el('span', {
        className: friend.online ? 'presence online' : 'presence',
        title: friend.online ? 'Online' : 'Offline',
      }),
    );
    return row;
  }
}
