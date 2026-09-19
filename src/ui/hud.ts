import {
  CHALLENGES,
  challengeById,
} from '../../spacetimedb/src/logic/challenges';
import { evaluateChallenge } from '../../spacetimedb/src/logic/scoring';
import type { DbConnection } from '../module_bindings';
import type { ServerClock } from '../net/clock';

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

/** Top-center card: phase, countdown, the challenge, and its live target checklist. */
export class RoundHud {
  private readonly root = document.getElementById('round')!;
  private readonly phaseEl = document.getElementById('round-phase')!;
  private readonly timerEl = document.getElementById('round-timer')!;
  private readonly titleEl = document.getElementById('round-title')!;
  private readonly blurbEl = document.getElementById('round-blurb')!;
  private readonly targetsEl = document.getElementById('round-targets')!;
  private readonly lobbyEl = document.getElementById('round-lobby')!;
  private readonly startButton = document.getElementById(
    'start-round',
  ) as HTMLButtonElement;

  constructor(
    private readonly conn: DbConnection,
    private readonly clock: ServerClock,
    onStart: () => Promise<void>,
  ) {
    this.startButton.addEventListener('click', async () => {
      this.startButton.disabled = true;
      try {
        await onStart();
      } finally {
        this.startButton.disabled = false;
      }
    });
  }

  /** Rebuilds the card from the client cache; call when game_state or pieces change. */
  refresh(): void {
    const state = this.conn.db.gameState.id.find(0);
    if (!state) return;
    const phase = state.phase.tag;
    this.root.hidden = false;
    this.root.dataset.phase = phase;
    this.phaseEl.textContent = `Round ${state.round} · ${PHASE_LABELS[phase] ?? phase}`;
    this.lobbyEl.hidden = phase !== 'Lobby';

    const inLobby = phase === 'Lobby';
    // In the lobby, preview the challenge that the next round will play.
    const challenge = inLobby
      ? challengeById(state.round % CHALLENGES.length)
      : challengeById(state.challengeId);
    this.titleEl.textContent = inLobby
      ? `Next: ${challenge.title}`
      : state.themeTitle;
    this.blurbEl.textContent = challenge.blurb;

    const evaluation = evaluateChallenge(challenge, [
      ...this.conn.db.piece.iter(),
    ]);
    this.targetsEl.replaceChildren(
      ...evaluation.targets.map((t) => {
        const li = document.createElement('li');
        li.classList.toggle('done', t.done && !inLobby);
        const label = document.createElement('span');
        label.textContent = t.label;
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = inLobby
          ? ''
          : t.done
            ? '✓'
            : `${t.value}/${t.goal}`;
        const bar = document.createElement('i');
        bar.style.width = `${inLobby ? 0 : Math.round(t.completion * 100)}%`;
        li.append(label, count, bar);
        return li;
      }),
    );
    this.tick();
  }

  /** Updates the countdown; cheap enough to call every frame. */
  tick(): void {
    const state = this.conn.db.gameState.id.find(0);
    if (!state) return;
    const endsAt = state.phaseEndsAt;
    const seconds = endsAt
      ? this.clock.secondsUntil(endsAt.microsSinceUnixEpoch)
      : null;
    if (state.phase.tag === 'Lobby') {
      this.timerEl.textContent =
        seconds === null ? '' : `starts in ${seconds}s`;
    } else {
      this.timerEl.textContent = seconds === null ? '' : formatClock(seconds);
    }
    this.timerEl.classList.toggle(
      'urgent',
      state.phase.tag === 'Building' && seconds !== null && seconds <= 10,
    );
  }
}
