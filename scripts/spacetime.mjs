// Runs the SpacetimeDB CLI with the given arguments.
// Uses SPACETIME_CLI when set (a direct path to spacetimedb-cli.exe works when the
// `spacetime` launcher is unavailable); otherwise runs `spacetime` from PATH.
import { spawnSync } from 'node:child_process';

const cli = process.env.SPACETIME_CLI || 'spacetime';
const result = spawnSync(cli, process.argv.slice(2), { stdio: 'inherit' });

if (result.error) {
  console.error(`Could not run "${cli}": ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
