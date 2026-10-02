import { challengeById } from '../../spacetimedb/src/logic/challenges';
import { boardOfPlot } from '../../spacetimedb/src/logic/plots';
import {
  pointsToNextStar,
  scoreBoard,
  STAR_THRESHOLDS,
} from '../../spacetimedb/src/logic/scoring';
import type { DbConnection } from '../module_bindings';
import type { ServerClock } from '../net/clock';
import { battleBoards, myGameState, myPlot, sharedBoard } from '../net/queries';
import { PlotVotePanel } from './battle';
import { COMPACT } from './layout';
import { LobbyPanel } from './lobby';
import type { Toast } from './toast';

const PHASE_LABELS: Record<string, string> = {
  Lobby: 'Lobby',
  Building: 'Build!',
  Scoring: 'Scoring',
  Showcase: 'Showcase',
  Voting: 'Vote!',
  Results: 'Results',
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** One line of the co-op score card: a label, a value, and an optional bar. */
function scoreLine(
  label: string,
  value: string,
  completion: number | null,
  done = false,
): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.toggle('done', done);
  const text = document.createElement('span');
  text.textContent = label;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = value;
  li.append(text, count);
  if (completion !== null) {
    const bar = document.createElement('i');
    bar.style.width = `${Math.round(completion * 100)}%`;
    li.append(bar);
  }
  return li;
}

/**
 * Top-center round card. Lobby: the theme ballot and idea input. Co-op: the theme,
 * the live score, and the combos found. Battle: your role, the showcase tour, then
 * the best-build vote.
 */
export class RoundHud {
  private readonly root = document.getElementById('round')!;
  private readonly phaseEl = document.getElementById('round-phase')!;
  private readonly timerEl = document.getElementById('round-timer')!;
  private readonly titleEl = document.getElementById('round-title')!;
  private readonly blurbEl = document.getElementById('round-blurb')!;
  private readonly scoreEl = document.getElementById('round-targets')!;
  private readonly optionsEl = document.getElementById('round-options')!;
  private readonly votesEl = document.getElementById('round-votes')!;
  private readonly lobbyEl = document.getElementById('round-lobby')!;
  private readonly startButton = document.getElementById(
    'start-round',
  ) as HTMLButtonElement;
  private readonly lobby: LobbyPanel;
  private readonly plotVotes: PlotVotePanel;
  private lastPhase = '';

  constructor(
    private readonly conn: DbConnection,
    private readonly clock: ServerClock,
    private readonly myHex: string,
    toast: Toast,
    onStart: () => Promise<void>,
    onPreview: () => void,
  ) {
    this.lobby = new LobbyPanel(conn, myHex, toast);
    this.plotVotes = new PlotVotePanel(conn, myHex, toast, onPreview);
    // On narrow screens the header collapses or expands the card.
    this.root
      .querySelector('.round-top')!
      .addEventListener('click', () => this.root.classList.toggle('collapsed'));
    this.startButton.addEventListener('click', async () => {
      this.startButton.disabled = true;
      try {
        await onStart();
      } catch (err) {
        toast.show(err instanceof Error ? err.message : String(err));
      } finally {
        this.startButton.disabled = false;
      }
    });
  }

  /** The battle build the player is looking at while voting, if they picked one. */
  get previewBoard(): number | null {
    return this.plotVotes.preview;
  }

  /** Rebuilds the card from the client cache; call whenever round tables change. */
  refresh(): void {
    const state = myGameState(this.conn, this.myHex);
    if (!state) {
      this.root.hidden = true;
      return;
    }
    const phase = state.phase.tag;
    const battle = state.mode.tag === 'Battle';
    const inLobby = phase === 'Lobby';
    this.root.hidden = false;
    if (phase !== this.lastPhase && COMPACT.matches) {
      // Phones: get the card out of the way while building, open it to vote.
      this.root.classList.toggle(
        'collapsed',
        phase !== 'Lobby' && phase !== 'Voting',
      );
    }
    if (phase !== this.lastPhase) this.plotVotes.preview = null;
    this.lastPhase = phase;
    this.root.dataset.phase = phase;
    this.phaseEl.textContent = `Round ${state.round} · ${PHASE_LABELS[phase] ?? phase}`;

    this.lobbyEl.hidden = !inLobby;
    this.optionsEl.hidden = !inLobby;
    this.scoreEl.hidden = inLobby || battle;
    this.votesEl.hidden = !(battle && phase === 'Voting');

    if (inLobby) {
      this.titleEl.textContent = 'Vote for the next round';
      this.blurbEl.textContent =
        'Build together on a co-op theme, battle on your own island, or suggest an idea.';
      this.lobby.render();
    } else if (battle) {
      this.renderBattle(
        phase,
        state.themeTitle,
        state.host?.toHexString(),
        state.showcaseBoard,
      );
    } else {
      this.renderCoop(state.challengeId, state.themeTitle);
    }
    this.tick();
  }

  /** The theme, the live score with progress to the next star, and the combos found. */
  private renderCoop(challengeId: number, title: string): void {
    this.titleEl.textContent = title;
    this.blurbEl.textContent = challengeById(challengeId).blurb;
    const { score, stars, combos } = scoreBoard(
      sharedBoard(this.conn, this.myHex),
    );
    const toNext = pointsToNextStar(score);
    const from = STAR_THRESHOLDS[stars - 1] ?? 0;
    const to = STAR_THRESHOLDS[stars] ?? from;
    const lines = [
      scoreLine(
        toNext === null ? 'Three stars!' : `Next ★ in ${toNext}`,
        `${score} pts ${'★'.repeat(stars)}`,
        toNext === null ? 1 : (score - from) / (to - from),
        toNext === null,
      ),
      ...combos.map((c) => scoreLine(c.label, `×2 · ${c.count}`, null, true)),
    ];
    if (combos.length === 0) {
      lines.push(
        scoreLine('Pairs score double: try a lamp by a path', '', null),
      );
    }
    this.scoreEl.replaceChildren(...lines);
  }

  private renderBattle(
    phase: string,
    theme: string,
    hostHex: string | undefined,
    showcaseBoard: number,
  ): void {
    if (phase === 'Voting') {
      this.titleEl.textContent = 'Vote for the best build';
      this.blurbEl.textContent = `Theme: ${theme}. Tap a build to look at it, then vote (not your own).`;
      this.plotVotes.render();
      return;
    }
    if (phase === 'Showcase') {
      const boards = battleBoards(this.conn, this.myHex);
      const builder = [...this.conn.db.plot.iter()].find(
        (p) => boardOfPlot(p.plotIndex) === showcaseBoard,
      );
      this.titleEl.textContent = `${builder?.builderName ?? 'A'}'s build`;
      this.blurbEl.textContent = `Theme: ${theme} · build ${boards.indexOf(showcaseBoard) + 1} of ${boards.length}`;
      return;
    }
    this.titleEl.textContent = `Build Battle: ${theme}`;
    if (phase !== 'Building') {
      this.blurbEl.textContent = 'The votes are in!';
    } else if (myPlot(this.conn, this.myHex)) {
      this.blurbEl.textContent =
        'Build your best version on your own private island. Everyone sees it in the showcase!';
    } else if (hostHex === this.myHex) {
      this.blurbEl.textContent =
        'Your idea won! The builders are working in private; every build is shown at the end.';
    } else {
      this.blurbEl.textContent =
        'You are watching this one. Every build is shown at the end, then you vote.';
    }
  }

  /** Updates the countdown; cheap enough to call every frame. */
  tick(): void {
    const state = myGameState(this.conn, this.myHex);
    if (!state) return;
    const endsAt = state.phaseEndsAt;
    const seconds = endsAt
      ? this.clock.secondsUntil(endsAt.microsSinceUnixEpoch)
      : null;
    const text =
      seconds === null
        ? ''
        : state.phase.tag === 'Lobby'
          ? `starts in ${seconds}s`
          : formatClock(seconds);
    if (this.timerEl.textContent !== text) this.timerEl.textContent = text;
    this.timerEl.classList.toggle(
      'urgent',
      (state.phase.tag === 'Building' || state.phase.tag === 'Voting') &&
        seconds !== null &&
        seconds <= 10,
    );
  }
}
