import {
  schema,
  t,
  table,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';

export const Phase = t.enum('Phase', [
  'Lobby',
  'Building',
  'Scoring',
  'Voting',
  'Results',
]);
export const Mode = t.enum('Mode', ['Coop', 'Battle']);

// Singleton row (id 0) describing the shared round state. Clients render the HUD and
// countdown from it; only reducers (and the phase timer) change it.
const gameState = table(
  { name: 'game_state', public: true },
  {
    id: t.u8().primaryKey(),
    phase: Phase,
    mode: Mode,
    round: t.u32(),
    themeTitle: t.string(),
    challengeId: t.u8(),
    host: t.option(t.identity()),
    phaseStartedAt: t.timestamp(),
    phaseEndsAt: t.option(t.timestamp()),
    teamScore: t.u32(),
  },
);

// Singleton row (id 0) with round timing in seconds; only the admin can change it.
const config = table(
  { name: 'config', public: true },
  {
    id: t.u8().primaryKey(),
    lobbySeconds: t.u32(),
    buildSeconds: t.u32(),
    scoringSeconds: t.u32(),
    votingSeconds: t.u32(),
    resultsSeconds: t.u32(),
  },
);

// Private: the publisher's identity, recorded in `init`.
const admin = table({ name: 'admin' }, { identity: t.identity().primaryKey() });

// One-shot timers that fire `advance_phase`. A timer only counts if it still matches
// the current round, phase, and end time; anything else is stale and ignored.
export const phaseTimer = table(
  { name: 'phase_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    round: t.u32(),
    phase: Phase,
  },
);

const Contribution = t.object('Contribution', {
  name: t.string(),
  colorIndex: t.u8(),
  pieces: t.u16(),
  votes: t.u16(),
});

const roundResult = table(
  { name: 'round_result', public: true },
  {
    round: t.u32().primaryKey(),
    mode: Mode,
    themeTitle: t.string(),
    challengeId: t.u8(),
    score: t.u32(),
    completed: t.bool(),
    stars: t.u8(),
    contributions: t.array(Contribution),
    endedAt: t.timestamp(),
  },
);

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    colorIndex: t.u8(),
    online: t.bool(),
    x: t.f32(),
    z: t.f32(),
    heading: t.f32(),
    moveBudget: t.f32(),
    lastMoveAt: t.timestamp(),
  },
);

// Private: one row per live connection, so a player stays online while any tab is open.
const session = table(
  { name: 'session' },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity().index('btree'),
  },
);

// The shared board. `tileKey` is unique, so the database itself guarantees at most
// one piece per tile even when several players click the same tile at once.
const piece = table(
  { name: 'piece', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    tileKey: t.u32().unique(),
    tileX: t.u8(),
    tileZ: t.u8(),
    kind: t.string(),
    rotation: t.u8(),
    placedBy: t.identity().index('btree'),
    placedAt: t.timestamp(),
    round: t.u32(),
  },
);

// Event table: rows are broadcast to subscribers once and never stored client-side.
// Drives the activity feed and placement effects.
const activity = table(
  { name: 'activity', public: true, event: true },
  {
    kind: t.string(),
    actorName: t.string(),
    colorIndex: t.u8(),
    pieceKind: t.string(),
    tileX: t.u8(),
    tileZ: t.u8(),
  },
);

// Lobby: player-submitted battle ideas (one per player) and the live theme vote.
const idea = table(
  { name: 'idea', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    author: t.identity().unique(),
    authorName: t.string(),
    text: t.string(),
    createdAt: t.timestamp(),
  },
);

const themeVote = table(
  { name: 'theme_vote', public: true },
  {
    voter: t.identity().primaryKey(),
    option: t.string(),
  },
);

// Build Battle: each builder's plot for the current round, and the best-build vote.
const plot = table(
  { name: 'plot', public: true },
  {
    builder: t.identity().primaryKey(),
    plotIndex: t.u8().unique(),
    builderName: t.string(),
    colorIndex: t.u8(),
  },
);

const plotVote = table(
  { name: 'plot_vote', public: true },
  {
    voter: t.identity().primaryKey(),
    plotIndex: t.u8(),
  },
);

// Accounts: a unique username bound to the owner's identity, plus saved stats.
export const account = table(
  { name: 'account', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().unique(),
    username: t.string(),
    usernameKey: t.string().unique(),
    colorIndex: t.u8(),
    roundsPlayed: t.u32(),
    wins: t.u32(),
    piecesPlaced: t.u32(),
    createdAt: t.timestamp(),
  },
);

// Private: each account's current recovery code. Only its owner sees it, through
// the `my_recovery_code` view.
export const accountSecret = table(
  { name: 'account_secret' },
  {
    accountId: t.u64().primaryKey(),
    recoveryCode: t.string().unique(),
  },
);

export const spacetimedb = schema({
  gameState,
  config,
  admin,
  phaseTimer,
  roundResult,
  player,
  session,
  piece,
  activity,
  idea,
  themeVote,
  plot,
  plotVote,
  account,
  accountSecret,
});

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
