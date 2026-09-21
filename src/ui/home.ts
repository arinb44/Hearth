import {
  formatRecoveryCode,
  USERNAME_MAX,
} from '../../spacetimedb/src/logic/accounts';
import {
  defaultIslandName,
  ISLAND_NAME_MAX,
  MAX_ISLAND_PLAYERS,
  MAX_ISLANDS_PER_ACCOUNT,
  NO_ISLAND,
  NO_OWNER,
} from '../../spacetimedb/src/logic/islands';
import type { DbConnection } from '../module_bindings';
import type { Account, Island } from '../module_bindings/types';
import { myIslandId } from '../net/queries';
import { BuildsPanel } from './builds';
import { colorDot } from './colors';
import { el, errorMessage } from './dom';
import { FriendsPanel } from './friends';
import type { Toast } from './toast';

/**
 * The main screen: create or recover an account, see your profile, stats, and
 * recovery code, pick an island, manage friends, and save or load builds. Everything
 * shown here is read live from the database.
 */
export class HomeScreen {
  private readonly root = document.getElementById('home')!;
  private readonly body = this.root.querySelector<HTMLElement>('.home-body')!;
  // Re-rendered on its own, so live player counts never wipe a half-typed form.
  private readonly islandList = el('ul', { className: 'islands' });
  private readonly friends: FriendsPanel;
  private readonly builds: BuildsPanel;
  private codeVisible = false;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    private readonly toast: Toast,
    private readonly onEntered: () => void,
  ) {
    this.friends = new FriendsPanel(conn, myHex, toast, (id, button) =>
      this.enter(id, button),
    );
    this.builds = new BuildsPanel(conn, myHex, toast, onEntered);
    const refresh = () => this.render();
    // Your own account redraws everything; anyone else's (presence, stats) only
    // touches the lists, so a half-typed form survives.
    const onAccount = (_ctx: unknown, row: Account) => {
      if (row.owner.toHexString() === myHex) this.render();
      else this.refreshLists();
    };
    conn.db.account.onInsert(onAccount);
    conn.db.account.onUpdate((ctx, _old, row) => onAccount(ctx, row));
    conn.db.account.onDelete(onAccount);
    conn.db.myRecoveryCode.onInsert(refresh);
    conn.db.myRecoveryCode.onDelete(refresh);
    const refreshLists = () => this.refreshLists();
    conn.db.island.onInsert(refreshLists);
    conn.db.island.onUpdate(refreshLists);
    conn.db.island.onDelete(refreshLists);
    conn.db.player.onInsert((_ctx, row) => {
      if (row.identity.toHexString() === myHex) this.render();
    });
    conn.db.player.onUpdate((_ctx, old, row) => {
      if (row.identity.toHexString() === myHex && old.islandId !== row.islandId)
        this.render();
    });
    this.render();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private myAccount(): Account | undefined {
    for (const a of this.conn.db.account.iter()) {
      if (a.owner.toHexString() === this.myHex) return a;
    }
    return undefined;
  }

  private refreshLists(): void {
    if (this.root.hidden) return;
    this.renderIslands();
    this.friends.render();
    this.builds.render();
  }

  private call(action: Promise<void>, onDone?: () => void): void {
    action
      .then(onDone)
      .catch((err: unknown) => this.toast.show(errorMessage(err)));
  }

  render(): void {
    if (this.root.hidden) return;
    const account = this.myAccount();
    this.body.replaceChildren(
      ...(account ? this.profile(account) : this.welcome()),
    );
  }

  private welcome(): HTMLElement[] {
    const name = el('input', {
      placeholder: 'Pick a username',
      maxLength: USERNAME_MAX,
      autocomplete: 'username',
    });
    const create = el(
      'form',
      { className: 'home-form' },
      name,
      el('button', { type: 'submit' }, 'Create account'),
    );
    create.addEventListener('submit', (e) => {
      e.preventDefault();
      this.call(this.conn.reducers.createAccount({ username: name.value }));
    });

    const code = el('input', {
      placeholder: 'XXXX-XXXX-XXXX',
      autocomplete: 'off',
    });
    const recover = el(
      'form',
      { className: 'home-form' },
      code,
      el('button', { type: 'submit', className: 'secondary' }, 'Sign in'),
    );
    recover.addEventListener('submit', (e) => {
      e.preventDefault();
      this.call(this.conn.reducers.recoverAccount({ code: code.value }), () =>
        this.toast.show('Signed in. Welcome back!'),
      );
    });

    return [
      el('p', {}, 'Create an account to keep your stats, friends, and builds.'),
      create,
      el('h3', {}, 'Already have an account?'),
      el(
        'p',
        { className: 'muted' },
        'Enter the recovery code from your other device.',
      ),
      recover,
    ];
  }

  private profile(account: Account): HTMLElement[] {
    const stats = el(
      'div',
      { className: 'stats' },
      ...(
        [
          ['Rounds', account.roundsPlayed],
          ['Wins', account.wins],
          ['Pieces', account.piecesPlaced],
        ] as const
      ).map(([label, value]) =>
        el('div', {}, el('strong', {}, String(value)), el('span', {}, label)),
      ),
    );

    const code = [...this.conn.db.myRecoveryCode.iter()][0]?.recoveryCode;
    const shown = code ? formatRecoveryCode(code) : '…';
    const codeText = el(
      'code',
      {},
      this.codeVisible ? shown : '••••-••••-••••',
    );
    const toggle = el(
      'button',
      { type: 'button', className: 'link' },
      this.codeVisible ? 'Hide' : 'Show',
    );
    toggle.addEventListener('click', () => {
      this.codeVisible = !this.codeVisible;
      this.render();
    });
    const copy = el('button', { type: 'button', className: 'link' }, 'Copy');
    copy.addEventListener('click', () => {
      navigator.clipboard
        .writeText(shown)
        .then(() => this.toast.show('Recovery code copied'))
        .catch(() => this.toast.show(shown));
    });
    const rotate = el(
      'button',
      { type: 'button', className: 'link' },
      'New code',
    );
    rotate.addEventListener('click', () =>
      this.call(this.conn.reducers.newRecoveryCode({}), () =>
        this.toast.show(
          'New recovery code issued; the old one no longer works',
        ),
      ),
    );

    this.friends.render();
    this.builds.render();
    return [
      el(
        'div',
        { className: 'profile' },
        colorDot(account.colorIndex),
        el('strong', {}, account.username),
      ),
      stats,
      el(
        'div',
        { className: 'recovery' },
        el('span', { className: 'muted' }, 'Recovery code'),
        codeText,
        toggle,
        copy,
        rotate,
      ),
      el(
        'p',
        { className: 'muted small' },
        'Use it to sign in on another device. Keep it secret: anyone with it can use your account.',
      ),
      ...this.islands(account),
      this.friends.root,
      this.builds.root,
    ];
  }

  private enter(islandId: bigint, button: HTMLButtonElement): void {
    button.disabled = true;
    this.conn.reducers
      .enterIsland({ islandId, name: '' })
      .then(() => this.onEntered())
      .catch((err: unknown) => {
        button.disabled = false;
        this.toast.show(errorMessage(err));
      });
  }

  private islands(account: Account): HTMLElement[] {
    this.renderIslands(account);
    const owned = [...this.conn.db.island.iter()].filter(
      (i) => i.ownerAccountId === account.id,
    ).length;
    const out: HTMLElement[] = [el('h3', {}, 'Islands'), this.islandList];

    if (owned < MAX_ISLANDS_PER_ACCOUNT) {
      const name = el('input', {
        placeholder: defaultIslandName(account.username),
        maxLength: ISLAND_NAME_MAX,
        autocomplete: 'off',
      });
      const create = el(
        'form',
        { className: 'home-form' },
        name,
        el('button', { type: 'submit', className: 'secondary' }, 'New island'),
      );
      create.addEventListener('submit', (e) => {
        e.preventDefault();
        this.call(this.conn.reducers.createIsland({ name: name.value }), () =>
          this.onEntered(),
        );
      });
      out.push(create);
    }

    if (myIslandId(this.conn, this.myHex) !== NO_ISLAND) {
      const leave = el(
        'button',
        { type: 'button', className: 'link' },
        'Leave island',
      );
      leave.addEventListener('click', () =>
        this.call(this.conn.reducers.leaveIsland({})),
      );
      out.push(el('p', { className: 'muted small' }, leave));
    }
    return out;
  }

  /** The main island, your islands, and any island with players on it. */
  private renderIslands(account = this.myAccount()): void {
    if (this.root.hidden || !account) return;
    const current = myIslandId(this.conn, this.myHex);
    const rank = (i: Island) =>
      i.ownerAccountId === NO_OWNER
        ? 0
        : i.ownerAccountId === account.id
          ? 1
          : 2;
    const shown = [...this.conn.db.island.iter()]
      .filter((i) => rank(i) < 2 || i.id === current || i.playerCount > 0)
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          b.playerCount - a.playerCount ||
          Number(a.id - b.id),
      )
      .slice(0, 8);

    this.islandList.replaceChildren(
      ...shown.map((island) => {
        const here = island.id === current;
        const full = !here && island.playerCount >= MAX_ISLAND_PLAYERS;
        const button = el(
          'button',
          { type: 'button', className: here ? 'play' : '', disabled: full },
          here ? 'Resume' : full ? 'Full' : 'Play',
        );
        button.addEventListener('click', () => this.enter(island.id, button));
        return el(
          'li',
          { className: here ? 'here' : '' },
          el(
            'div',
            {},
            el('strong', {}, island.name),
            el(
              'span',
              { className: 'muted small' },
              this.ownerLabel(island, account) +
                ' · ' +
                island.playerCount +
                '/' +
                MAX_ISLAND_PLAYERS +
                ' online',
            ),
          ),
          button,
        );
      }),
    );
  }

  private ownerLabel(island: Island, me: Account): string {
    if (island.ownerAccountId === NO_OWNER) return 'Open to everyone';
    if (island.ownerAccountId === me.id) return 'Your island';
    for (const a of this.conn.db.account.iter()) {
      if (a.id === island.ownerAccountId) return 'Host: ' + a.username;
    }
    return 'Player island';
  }
}
