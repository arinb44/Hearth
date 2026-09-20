import './ui/styles.css';
import { Game } from './game/game';
import { IS_TOUCH } from './input/touch';
import { connect, type ConnectionStatus } from './net/connection';
import { resetReconnectBackoff, scheduleReconnect } from './net/reconnect';
import { loadPieceModels } from './scene/modelLibrary';
import { installModelLibrary } from './scene/pieceModels';
import { setUpLandscape } from './ui/orientation';
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
if (IS_TOUCH) {
  document.body.classList.add('touch');
  setUpLandscape();
  document.getElementById('hint')!.textContent =
    'Drag the joystick to walk · tap a tile to build';
}

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

let reconnecting = false;

connect({
  onStatus(status, detail) {
    const labels = {
      connected: 'Online',
      connecting: 'Connecting…',
      disconnected: 'Disconnected',
      error: `Connection error${detail ? `: ${detail}` : ''}`,
    };
    setStatus(status, labels[status]);
    if (status === 'connected') resetReconnectBackoff();
    if ((status === 'disconnected' || status === 'error') && !reconnecting) {
      reconnecting = true;
      scheduleReconnect((seconds) =>
        setStatus(status, `Reconnecting in ${seconds}s…`),
      );
    }
  },
  onReady(conn, identity) {
    void modelsReady.then(() => {
      game = new Game(world, conn, identity);
    });
  },
});
