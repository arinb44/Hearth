import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import type { DbConnection } from '../module_bindings';

const BANNER_MS = 2500;

/** The "time's up" banner and the end-of-round results card. */
export class ResultsView {
  private readonly banner = document.getElementById('banner')!;
  private readonly root = document.getElementById('results')!;
  private bannerTimer: number | undefined;

  constructor(private readonly conn: DbConnection) {}

  /** Call when the phase changes. */
  onPhase(phase: string, round: number): void {
    const result = this.conn.db.roundResult.round.find(round);
    if (phase === 'Scoring') {
      this.showBanner(
        result?.completed ? 'Challenge complete! 🎉' : "Time's up!",
      );
    }
    this.root.hidden = !(phase === 'Results' && result);
    if (phase === 'Results' && result) this.renderResult(result);
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = false;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(
      () => (this.banner.hidden = true),
      BANNER_MS,
    );
  }

  private renderResult(
    result: NonNullable<
      ReturnType<DbConnection['db']['roundResult']['round']['find']>
    >,
  ): void {
    const card = this.root.querySelector('.card')!;
    const title = document.createElement('h1');
    title.textContent = result.themeTitle;
    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.textContent = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars);
    const score = document.createElement('div');
    score.className = 'score';
    score.textContent = `${result.score} points`;
    const note = document.createElement('p');
    note.textContent = result.completed
      ? 'Every target met, with a time bonus!'
      : 'Targets partly met. Faster teamwork next time!';

    const list = document.createElement('ul');
    list.className = 'contributions';
    for (const c of result.contributions) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = `#${PLAYER_COLORS[
        c.colorIndex % PLAYER_COLORS.length
      ]
        .toString(16)
        .padStart(6, '0')}`;
      li.append(
        dot,
        `${c.name}`,
        Object.assign(document.createElement('em'), {
          textContent: `${c.pieces} piece${c.pieces === 1 ? '' : 's'}`,
        }),
      );
      list.append(li);
    }
    card.replaceChildren(title, stars, score, note, list);
  }
}
