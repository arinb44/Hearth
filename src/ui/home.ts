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
import type { Account, GameState, Island } from '../module_bindings/types';
import { myIslandId } from '../net/queries';
import { BuildsPanel } from './builds';
import { colorDot } from './colors';
import { el, errorMessage } from './dom';
import { FriendsPanel } from './friends';
import type { Toast } from './toast';

type Tab = 'islands' | 'friends' | 'builds' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'islands', label: 'Islands' },
  { id: 'friends', label: 'Friends' },
  { id: 'builds', label: 'Builds' },
  { id: 'profile', label: 'Profile' },
];

/** What an island is doing right now, for its row in the islands list. */
function islandStatus(state: GameState | undefined): string {
  switch (state?.phase.tag) {
    case undefined:
      return '';
    case 'Lobby':
      return 'in the lobby';
    case 'Building':
      return state.mode.tag === 'Battle' ? 'Build Battle' : 'building together';
    case 'Showcase':
    case 'Voting':
      return 'voting on builds';
    default:
      return 'round ending';
  }
}

/**
 * The main screen, and the menu over the game (☰ Menu or Esc): create or recover an
 * account, then tabs for islands, friends, saved builds, and your profile. On an
 * island it also offers Back to game and Exit to main menu. Everything shown here is
 * read live from the database.
 */
export class HomeScreen {
  private readonly root = document.getElementById('home')!;
  private readonly body = this.root.querySelector<HTMLElement>('.home-body')!;
  // Re-rendered on their own, so live counts never wipe a half-typed form.
  private readonly islandList = el('ul', { className: 'islands' });
  private readonly tabBar = el('nav', { className: 'home-tabs' });
  private readonly friends: FriendsPanel;
  private readonly builds: BuildsPanel;
  private tab: Tab = 'islands';
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
    const refreshIslands = () => this.renderIslands();
    conn.db.gameState.onInsert(refreshIslands);
    conn.db.gameState.onUpdate(refreshIslands);
    conn.db.gameState.onDelete(refreshIslands);
    const refreshTabs = () => this.renderTabs();
    conn.db.friendRequest.onInsert(refreshTabs);
    conn.db.friendRequest.onDelete(refreshTabs);
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
    this.renderTabs();
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
      ...(account ? this.signedIn(account) : this.welcome()),
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

    return [
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
    ];
  }

  /** Your name, the in-game buttons, the tab bar, and the open tab. */
  private signedIn(account: Account): HTMLElement[] {
    this.renderTabs();
    return [
      el(
        'div',
        { className: 'profile' },
        colorDot(account.colorIndex),
        el('strong', {}, account.username),
      ),
      ...this.gameButtons(),
      this.tabBar,
      ...this.tabContent(account),
    ];
  }

  /** On an island, the menu leads back into the game or out to the main screen. */
  private gameButtons(): HTMLElement[] {
    if (myIslandId(this.conn, this.myHex) === NO_ISLAND) return [];
    const back = el(
      'button',
      { type: 'button', className: 'play' },
      'Back to game',
    );
    back.addEventListener('click', () => this.onEntered());
    const exit = el(
      'button',
      { type: 'button', className: 'secondary' },
      'Exit to main menu',
    );
    exit.addEventListener('click', () =>
      this.call(this.conn.reducers.leaveIsland({})),
    );
    return [el('div', { className: 'menu-actions' }, back, exit)];
  }

  private tabContent(account: Account): HTMLElement[] {
    switch (this.tab) {
      case 'islands':
        return this.islands(account);
      case 'friends':
        this.friends.render();
        return [this.friends.root];
      case 'builds':
        this.builds.render();
        return [this.builds.root];
      case 'profile':
        return this.profile(account);
    }
  }

  /** The tab buttons; Friends counts the requests waiting for your answer. */
  private renderTabs(): void {
    const me = this.myAccount();
    const waiting = me
      ? [...this.conn.db.friendRequest.iter()].filter(
          (r) => r.toAccountId === me.id,
        ).length
      : 0;
    this.tabBar.replaceChildren(
      ...TABS.map(({ id, label }) => {
        const button = el(
          'button',
          { type: 'button', className: id === this.tab ? 'active' : '' },
          label,
        );
        if (id === 'friends' && waiting > 0) {
          button.append(el('span', { className: 'badge' }, String(waiting)));
        }
        button.addEventListener('click', () => {
          this.tab = id;
          this.render();
        });
        return button;
      }),
    );
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
    const out: HTMLElement[] = [this.islandList];

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
    return out;
  }

  /** The main island, your islands, and any island with players on it. */
  private renderIslands(account = this.myAccount()): void {
    if (this.root.hidden || !account || this.tab !== 'islands') return;
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
              [
                this.ownerLabel(island, account),
                `${island.playerCount}/${MAX_ISLAND_PLAYERS} online`,
                islandStatus(
                  this.conn.db.gameState.islandId.find(island.id) ?? undefined,
                ),
              ]
                .filter(Boolean)
                .join(' · '),
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
