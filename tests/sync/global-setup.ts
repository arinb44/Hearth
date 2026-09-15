import { execFileSync } from 'node:child_process';
import { SPACETIME_CLI, TEST_DB } from './config';

function run(args: string[]): void {
  execFileSync(SPACETIME_CLI, args, { stdio: 'inherit' });
}

// Regenerates bindings and republishes the module to a fresh local test database,
// so every sync run starts from the current schema and an empty world.
export default function setup(): void {
  try {
    execFileSync(SPACETIME_CLI, ['server', 'ping', 'local'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'Sync tests need a local SpacetimeDB server. Start one with `npm run stdb:start` ' +
        '(or `spacetime start`) in another terminal, then re-run `npm run test:sync`.',
    );
  }
  run([
    'generate',
    '--lang',
    'typescript',
    '--out-dir',
    'src/module_bindings',
    '--module-path',
    'spacetimedb',
  ]);
  run([
    'publish',
    TEST_DB,
    '--module-path',
    'spacetimedb',
    '--server',
    'local',
    '--delete-data=always',
    '--yes',
  ]);
}
