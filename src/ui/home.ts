import {
  formatRecoveryCode,
  USERNAME_MAX,
} from '../../spacetimedb/src/logic/accounts';
import type { DbConnection } from '../module_bindings';
import type { Account } from '../module_bindings/types';
import { colorDot } from './colors';
import type { Toast } from './toast';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * The main screen: create or recover an account, see your profile, stats, and
 * recovery code, then play. Everything shown here is read live from the database.
 */
export class HomeScreen {
  private readonly root = document.getElementById('home')!;
  private readonly body = this.root.querySelector<HTMLElement>('.home-body')!;
  private codeVisible = false;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    private readonly toast: Toast,
    private readonly onPlay: () => Promise<void>,
  ) {
    const refresh = () => this.render();
    conn.db.account.onInsert(refresh);
    conn.db.account.onUpdate(refresh);
    conn.db.account.onDelete(refresh);
    conn.db.myRecoveryCode.onInsert(refresh);
    conn.db.myRecoveryCode.onDelete(refresh);
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

    const play = el('button', { type: 'button', className: 'play' }, 'Play');
    play.addEventListener('click', () => {
      play.disabled = true;
      this.onPlay()
        .catch((err: unknown) => this.toast.show(errorMessage(err)))
        .finally(() => (play.disabled = false));
    });

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
      play,
    ];
  }
}
