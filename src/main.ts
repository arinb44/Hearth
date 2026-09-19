import './ui/styles.css';
import { Game } from './game/game';
import { connect, type ConnectionStatus } from './net/connection';
import { createWorld } from './scene/world';

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
    game = new Game(world, conn, identity);
  },
});
