import { schema, table, t } from 'spacetimedb/server';

const Phase = t.enum('Phase', ['Lobby', 'Building', 'Scoring', 'Results']);

// Singleton row (id 0) describing the shared round state.
const gameState = table(
  { name: 'game_state', public: true },
  {
    id: t.u8().primaryKey(),
    phase: Phase,
    round: t.u32(),
  },
);

const spacetimedb = schema({ gameState });
export default spacetimedb;

export const init = spacetimedb.init((ctx) => {
  ctx.db.gameState.insert({ id: 0, phase: { tag: 'Lobby' }, round: 0 });
});
