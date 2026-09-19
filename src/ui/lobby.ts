import { CHALLENGES } from '../../spacetimedb/src/logic/challenges';
import {
  BATTLE_THEMES,
  MAX_IDEA_LENGTH,
  optionKey,
  tallyVotes,
} from '../../spacetimedb/src/logic/themes';
import type { DbConnection } from '../module_bindings';
import { colorDot } from './colors';
import type { Toast } from './toast';

interface BallotOption {
  key: string;
  title: string;
  tag: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Lobby ballot: live theme vote counts, the player's own vote, and idea input. */
export class LobbyPanel {
  private readonly list = document.getElementById('round-options')!;
  private readonly form = document.getElementById(
    'idea-form',
  ) as HTMLFormElement;
  private readonly input = this.form.querySelector('input')!;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    toast: Toast,
  ) {
    this.input.maxLength = MAX_IDEA_LENGTH;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      conn.reducers
        .submitIdea({ text })
        .then(() => (this.input.value = ''))
        .catch((err: unknown) => toast.show(errorMessage(err)));
    });
    this.list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-option]',
      );
      if (!button) return;
      conn.reducers
        .voteTheme({ option: button.dataset.option! })
        .catch((err: unknown) => toast.show(errorMessage(err)));
    });
  }

  render(): void {
    const votes = [...this.conn.db.themeVote.iter()];
    const tally = tallyVotes(votes.map((v) => v.option));
    const top = Math.max(0, ...tally.values());
    const mine = votes.find(
      (v) => v.voter.toHexString() === this.myHex,
    )?.option;

    const voterColors = new Map<string, number[]>();
    for (const v of votes) {
      const voter = this.conn.db.player.identity.find(v.voter);
      if (!voter) continue;
      voterColors.set(v.option, [
        ...(voterColors.get(v.option) ?? []),
        voter.colorIndex,
      ]);
    }

    const options: BallotOption[] = [
      ...CHALLENGES.map((c) => ({
        key: optionKey('challenge', c.id),
        title: c.title,
        tag: 'Co-op',
      })),
      ...BATTLE_THEMES.map((t, i) => ({
        key: optionKey('battle', i),
        title: t,
        tag: 'Battle',
      })),
      ...[...this.conn.db.idea.iter()].map((i) => ({
        key: optionKey('idea', i.id),
        title: i.text,
        tag: `Idea · ${i.authorName}`,
      })),
    ];

    this.list.replaceChildren(
      ...options.map((o) => {
        const count = tally.get(o.key) ?? 0;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.option = o.key;
        button.classList.toggle('mine', o.key === mine);
        button.classList.toggle('leading', count > 0 && count === top);
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = o.title;
        const tag = document.createElement('small');
        tag.textContent = o.tag;
        const voters = document.createElement('span');
        voters.className = 'voters';
        voters.append(...(voterColors.get(o.key) ?? []).map(colorDot));
        button.append(title, tag, voters);
        return button;
      }),
    );
  }
}
