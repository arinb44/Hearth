import type { DbConnection } from '../module_bindings';
import { resultFor } from '../net/queries';
import type { RoundResult } from '../module_bindings/types';
import { colorDot } from './colors';

const BANNER_MS = 2500;
const CONFETTI_PIECES = 70;
const CONFETTI_COLORS = [
  '#ff6b6b',
  '#ffd43b',
  '#69db7c',
  '#4dabf7',
  '#b197fc',
  '#ff922b',
];

/** Phase banners and the end-of-round results card, for co-op and battle rounds. */
export class ResultsView {
  private readonly banner = document.getElementById('banner')!;
  private readonly root = document.getElementById('results')!;
  private bannerTimer: number | undefined;

  constructor(private readonly conn: DbConnection) {}

  /** Call when the island's phase changes. */
  onPhase(phase: string, round: number, islandId: bigint): void {
    const result = resultFor(this.conn, islandId, round);
    if (phase === 'Scoring') {
      this.showBanner(
        result?.completed ? 'Challenge complete! 🎉' : "Time's up!",
      );
    } else if (phase === 'Voting') {
      this.showBanner("Time's up! Vote for the best build");
    }
    const show = phase === 'Results' && !!result;
    this.root.hidden = !show;
    if (show) this.renderResult(result);
  }

  /** Hides the banner and results card, when leaving an island. */
  hide(): void {
    window.clearTimeout(this.bannerTimer);
    this.banner.hidden = true;
    this.root.hidden = true;
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

  private renderResult(result: RoundResult): void {
    const battle = result.mode.tag === 'Battle';
    const title = document.createElement('h1');
    title.textContent = result.themeTitle;

    const headline = document.createElement('div');
    const note = document.createElement('p');
    if (battle) {
      const winners = result.contributions.filter(
        (c) => c.votes > 0 && c.votes === result.score,
      );
      headline.className = 'score';
      headline.textContent = winners.length
        ? `🏆 ${winners.map((w) => w.name).join(' & ')} win${winners.length === 1 ? 's' : ''}!`
        : 'No votes this time';
      note.textContent = winners.length
        ? `${result.score} vote${result.score === 1 ? '' : 's'} for the winning build.`
        : 'Remember to vote next battle!';
    } else {
      const stars = document.createElement('div');
      stars.className = 'stars';
      stars.textContent =
        '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars);
      headline.className = 'score';
      headline.textContent = `${result.score} points`;
      headline.prepend(stars);
      note.textContent = result.completed
        ? 'Every target met, with a time bonus!'
        : 'Targets partly met. Faster teamwork next time!';
    }

    const list = document.createElement('ul');
    list.className = 'contributions';
    for (const c of result.contributions) {
      const li = document.createElement('li');
      const detail = document.createElement('em');
      detail.textContent = battle
        ? `${c.votes} vote${c.votes === 1 ? '' : 's'} · ${c.pieces} pieces`
        : `${c.pieces} piece${c.pieces === 1 ? '' : 's'}`;
      li.append(colorDot(c.colorIndex), c.name, detail);
      list.append(li);
    }
    this.root
      .querySelector('.card')!
      .replaceChildren(title, headline, note, list);
    const celebrate = battle ? result.score > 0 : result.completed;
    this.root
      .querySelector('.confetti')!
      .replaceChildren(...(celebrate ? confetti() : []));
  }
}

function confetti(): HTMLElement[] {
  return Array.from({ length: CONFETTI_PIECES }, (_, i) => {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    return piece;
  });
}
