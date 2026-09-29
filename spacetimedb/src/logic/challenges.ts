// Co-op themes shared by the module (round setup) and the client (ballot, round card).
// A theme is only inspiration: there is no checklist, and every piece scores (see
// scoring.ts). Pure TypeScript: must not import spacetimedb/server.

export interface Challenge {
  id: number;
  title: string;
  blurb: string;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 0,
    title: 'Cozy Village',
    blurb: 'Homes with flower beds and a well, and lamps along the lanes.',
  },
  {
    id: 1,
    title: 'Forest Camp',
    blurb: 'Cabins in the woods, with fireflies dancing over the trees.',
  },
  {
    id: 2,
    title: 'Castle Lookout',
    blurb: 'Towers joined by stone walls, watching over the island.',
  },
  {
    id: 3,
    title: 'Flower Park',
    blurb: 'Fenced flower beds, benches by the paths, a bridge over a pond.',
  },
];

export function challengeById(id: number): Challenge {
  return CHALLENGES[id] ?? CHALLENGES[0];
}
