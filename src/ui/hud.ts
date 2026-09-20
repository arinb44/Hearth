import { challengeById } from '../../spacetimedb/src/logic/challenges';
import { evaluateChallenge } from '../../spacetimedb/src/logic/scoring';
import type { DbConnection } from '../module_bindings';
import type { ServerClock } from '../net/clock';
import { myPlot } from '../net/queries';
import { PlotVotePanel } from './battle';
import { COMPACT } from './layout';
import { LobbyPanel } from './lobby';
import type { Toast } from './toast';

const PHASE_LABELS: Record<string, string> = {
  Lobby: 'Lobby',
  Building: 'Build!',
  Scoring: 'Scoring',
  Voting: 'Vote!',
  Results: 'Results',
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Top-center round card. Lobby: the theme ballot and idea input. Co-op: the challenge
 * and its live checklist. Battle: your role, then the best-build vote.
 */
export class RoundHud {
  private readonly root = document.getElementById('round')!;
  private readonly phaseEl = document.getElementById('round-phase')!;
  private readonly timerEl = document.getElementById('round-timer')!;
  private readonly titleEl = document.getElementById('round-title')!;
  private readonly blurbEl = document.getElementById('round-blurb')!;
  private readonly targetsEl = document.getElementById('round-targets')!;
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
  ) {
    this.lobby = new LobbyPanel(conn, myHex, toast);
    this.plotVotes = new PlotVotePanel(conn, myHex, toast);
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

  /** Rebuilds the card from the client cache; call whenever round tables change. */
  refresh(): void {
    const state = this.conn.db.gameState.id.find(0);
    if (!state) return;
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
    this.lastPhase = phase;
    this.root.dataset.phase = phase;
    this.phaseEl.textContent = `Round ${state.round} · ${PHASE_LABELS[phase] ?? phase}`;

    this.lobbyEl.hidden = !inLobby;
    this.optionsEl.hidden = !inLobby;
    this.targetsEl.hidden = inLobby || battle;
    this.votesEl.hidden = !(battle && phase === 'Voting');

    if (inLobby) {
      this.titleEl.textContent = 'Vote for the next round';
      this.blurbEl.textContent =
        'Pick a co-op challenge or a battle theme, or suggest your own idea.';
      this.lobby.render();
    } else if (battle) {
      this.renderBattle(phase, state.themeTitle, state.host?.toHexString());
    } else {
      this.renderCoop(state.challengeId, state.themeTitle);
    }
    this.tick();
  }

  private renderCoop(challengeId: number, title: string): void {
    const challenge = challengeById(challengeId);
    this.titleEl.textContent = title;
    this.blurbEl.textContent = challenge.blurb;
    const evaluation = evaluateChallenge(challenge, [
      ...this.conn.db.piece.iter(),
    ]);
    this.targetsEl.replaceChildren(
      ...evaluation.targets.map((t) => {
        const li = document.createElement('li');
        li.classList.toggle('done', t.done);
        const label = document.createElement('span');
        label.textContent = t.label;
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = t.done ? '✓' : `${t.value}/${t.goal}`;
        const bar = document.createElement('i');
        bar.style.width = `${Math.round(t.completion * 100)}%`;
        li.append(label, count, bar);
        return li;
      }),
    );
  }

  private renderBattle(
    phase: string,
    theme: string,
    hostHex: string | undefined,
  ): void {
    const building = myPlot(this.conn, this.myHex) !== undefined;
    if (phase === 'Voting') {
      this.titleEl.textContent = 'Vote for the best build';
      this.blurbEl.textContent = `Theme: ${theme}. Walk around, then pick a favourite (not your own).`;
      this.plotVotes.render();
      return;
    }
    this.titleEl.textContent = `Build Battle: ${theme}`;
    if (phase !== 'Building') {
      this.blurbEl.textContent = 'The votes are in!';
    } else if (building) {
      this.blurbEl.textContent =
        'Build your best version inside your plot. Everyone votes after!';
    } else if (hostHex === this.myHex) {
      this.blurbEl.textContent =
        'Your idea won! Watch the builders, then vote for the best one.';
    } else {
      this.blurbEl.textContent =
        'You are spectating this one. Watch the builders, then vote.';
    }
  }

  /** Updates the countdown; cheap enough to call every frame. */
  tick(): void {
    const state = this.conn.db.gameState.id.find(0);
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
