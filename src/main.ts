import './ui/styles.css';
import { connect, type ConnectionStatus } from './net/connection';
import type { DbConnection } from './module_bindings';
import { createWorld } from './scene/world';

const statusEl = document.getElementById('status')!;

function setStatus(status: ConnectionStatus, text: string): void {
  statusEl.dataset.status = status;
  statusEl.textContent = text;
}

function showGameState(conn: DbConnection): void {
  const state = conn.db.gameState.id.find(0);
  if (state)
    setStatus('connected', `${state.phase.tag} · round ${state.round}`);
}

const world = createWorld(document.getElementById('app')!);
world.start(() => {});

connect({
  onStatus(status, detail) {
    if (status === 'connected') return; // onReady shows the game state instead
    const labels = {
      connecting: 'Connecting…',
      disconnected: 'Disconnected',
      error: `Connection error${detail ? `: ${detail}` : ''}`,
    };
    setStatus(status, labels[status]);
  },
  onReady(conn) {
    showGameState(conn);
    conn.db.gameState.onUpdate(() => showGameState(conn));
  },
});
