import './ui/styles.css';
import { Game } from './game/game';
import { connect, type ConnectionStatus } from './net/connection';
import { loadPieceModels } from './scene/modelLibrary';
import { installModelLibrary } from './scene/pieceModels';
import { createWorld } from './scene/world';

const MODEL_TIMEOUT_MS = 8000;

// Real models load in parallel with the connection; on failure or a slow network the
// procedural models are used instead, so the game always starts.
const modelsReady = Promise.race([
  loadPieceModels().then(installModelLibrary),
  new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('timed out')), MODEL_TIMEOUT_MS),
  ),
]).catch((err: unknown) => console.warn('Using built-in piece models:', err));

const statusEl = document.getElementById('status')!;

function setStatus(status: ConnectionStatus, text: string): void {
  statusEl.dataset.status = status;
  statusEl.textContent = text;
}

const world = createWorld(document.getElementById('app')!);
let game: Game | null = null;
world.start((dt) => {
  if (game) game.update(dt);
  else world.follow(null, dt);
});

connect({
  onStatus(status, detail) {
    const labels = {
      connected: 'Online',
      connecting: 'Connecting…',
      disconnected: 'Disconnected',
      error: `Connection error${detail ? `: ${detail}` : ''}`,
    };
    setStatus(status, labels[status]);
  },
  onReady(conn, identity) {
    void modelsReady.then(() => {
      game = new Game(world, conn, identity);
    });
  },
});
