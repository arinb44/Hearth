// Simulated players for load testing and demo rehearsal. Each bot enters the main
// island (or the one given by --island), wanders, and places pieces near itself,
// and the script reports reducer round-trip times.
//
//   npm run bots -- --count 10 --target maincloud --seconds 60
//   npm run bots -- --count 3 --target local --seconds 20 --no-build
//   npm run bots -- --count 9 --target local --island 2
import { DbConnection } from '../src/module_bindings';
import { worldToTile } from '../spacetimedb/src/logic/grid';
import {
  clampToWorld,
  WALK_SPEED,
  type Vec2,
} from '../spacetimedb/src/logic/movement';
import { NO_OWNER } from '../spacetimedb/src/logic/islands';
import { PIECE_KINDS } from '../spacetimedb/src/logic/pieces';
import { plotCenter } from '../spacetimedb/src/logic/plots';

const TARGETS = {
  local: { host: 'ws://127.0.0.1:3000', db: 'coop-builder' },
  maincloud: {
    host: 'wss://maincloud.spacetimedb.com',
    db: 'coop-builder-mhacks',
  },
} as const;

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const count = Number(option('count', '10'));
const seconds = Number(option('seconds', '60'));
const targetName = option('target', 'local') as keyof typeof TARGETS;
const target = TARGETS[targetName];
const build = !process.argv.includes('--no-build');
const islandOption = option('island', '');
if (!target)
  throw new Error(`Unknown target "${targetName}" (use local or maincloud)`);

const TICK_MS = 100;
const latencies: number[] = [];
const stats = { moves: 0, placed: 0, rejected: 0, errors: 0 };

async function timed(call: () => Promise<void>): Promise<boolean> {
  const start = performance.now();
  try {
    await call();
    latencies.push(performance.now() - start);
    return true;
  } catch {
    latencies.push(performance.now() - start);
    return false;
  }
}

function connectBot(): Promise<{ conn: DbConnection; hex: string }> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(target.host)
      .withDatabaseName(target.db)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, hex: identity.toHexString() }))
          .onError(() => reject(new Error('subscription failed')))
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function runBot(index: number, deadline: number): Promise<DbConnection> {
  const { conn, hex } = await connectBot();
  const islandId = islandOption
    ? BigInt(islandOption)
    : [...conn.db.island.iter()].find((i) => i.ownerAccountId === NO_OWNER)!.id;
  await conn.reducers.enterIsland({ islandId, name: `Bot ${index + 1}` });
  const me = () =>
    [...conn.db.player.iter()].find((p) => p.identity.toHexString() === hex)!;
  let pos: Vec2 = { x: me().x, z: me().z };
  let waypoint = pos;
  let lastRound = -1;

  while (Date.now() < deadline) {
    const state = conn.db.gameState.islandId.find(islandId);
    const myPlot = [...conn.db.plot.iter()].find(
      (p) => p.islandId === islandId && p.builder.toHexString() === hex,
    );
    if (state && state.round !== lastRound) {
      // Server may have moved us (battle plots): restart from where it put us.
      lastRound = state.round;
      pos = { x: me().x, z: me().z };
      waypoint = pos;
    }

    if (Math.hypot(waypoint.x - pos.x, waypoint.z - pos.z) < 0.3) {
      const home = myPlot ? plotCenter(myPlot.plotIndex) : { x: 0, z: 0 };
      const spread = myPlot ? 2.5 : 8;
      waypoint = clampToWorld({
        x: home.x + (Math.random() - 0.5) * 2 * spread,
        z: home.z + (Math.random() - 0.5) * 2 * spread,
      });
    }
    const dx = waypoint.x - pos.x;
    const dz = waypoint.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(dist, WALK_SPEED * 0.8 * (TICK_MS / 1000));
    pos = { x: pos.x + (dx / dist) * step, z: pos.z + (dz / dist) * step };
    stats.moves++;
    void timed(() =>
      conn.reducers.move({ x: pos.x, z: pos.z, heading: Math.atan2(dx, dz) }),
    );

    if (build && Math.random() < 0.03) {
      const tile = { x: worldToTile(pos.x), z: worldToTile(pos.z) };
      const kind = PIECE_KINDS[Math.floor(Math.random() * PIECE_KINDS.length)];
      void timed(() =>
        conn.reducers.placePiece({
          kind,
          tileX: tile.x,
          tileZ: tile.z,
          rotation: Math.floor(Math.random() * 4),
        }),
      ).then((ok) => (ok ? stats.placed++ : stats.rejected++));
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  return conn;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

function report(label: string): void {
  console.log(
    `${label}: moves=${stats.moves} placed=${stats.placed} rejected=${stats.rejected} ` +
      `errors=${stats.errors} rtt p50=${percentile(latencies, 50).toFixed(0)}ms ` +
      `p95=${percentile(latencies, 95).toFixed(0)}ms max=${Math.max(0, ...latencies).toFixed(0)}ms`,
  );
}

async function main(): Promise<void> {
  console.log(
    `Starting ${count} bots on ${targetName} (${target.db}) for ${seconds}s…`,
  );
  const deadline = Date.now() + seconds * 1000;
  const progress = setInterval(() => report('progress'), 10_000);
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => runBot(i, deadline)),
  );
  clearInterval(progress);
  for (const r of results) {
    if (r.status === 'fulfilled') r.value.disconnect();
    else {
      stats.errors++;
      console.error('bot failed:', r.reason);
    }
  }
  report('final');
  // Give disconnects a moment to flush before exiting.
  setTimeout(() => process.exit(stats.errors ? 1 : 0), 500);
}

void main();
