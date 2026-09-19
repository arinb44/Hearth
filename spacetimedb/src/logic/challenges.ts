// Co-op challenge definitions shared by the module (scoring) and the client (checklist).
// Pure TypeScript: must not import spacetimedb/server.
import type { PieceKind } from './pieces';

export type Target =
  | { type: 'count'; kinds: PieceKind[]; min: number; label: string }
  | { type: 'adjacent'; kind: PieceKind; to: PieceKind[]; label: string };

export interface Challenge {
  id: number;
  title: string;
  blurb: string;
  targets: Target[];
}

export const CHALLENGES: Challenge[] = [
  {
    id: 0,
    title: 'Cozy Village',
    blurb: 'Houses along a path, with a well for the neighbours.',
    targets: [
      { type: 'count', kinds: ['house'], min: 4, label: '4 Houses' },
      { type: 'count', kinds: ['path'], min: 6, label: '6 Paths' },
      { type: 'count', kinds: ['well'], min: 1, label: '1 Well' },
      {
        type: 'adjacent',
        kind: 'house',
        to: ['path'],
        label: 'Every House next to a Path',
      },
    ],
  },
  {
    id: 1,
    title: 'Forest Camp',
    blurb: 'A cabin in the woods, lit up for the night.',
    targets: [
      {
        type: 'count',
        kinds: ['tree', 'pine'],
        min: 8,
        label: '8 Trees or Pines',
      },
      { type: 'count', kinds: ['rock'], min: 3, label: '3 Rocks' },
      { type: 'count', kinds: ['lamp'], min: 2, label: '2 Lamps' },
      { type: 'count', kinds: ['house'], min: 1, label: '1 House' },
    ],
  },
  {
    id: 2,
    title: 'Castle Lookout',
    blurb: 'Towers on guard behind a fence, reachable by road.',
    targets: [
      { type: 'count', kinds: ['tower'], min: 2, label: '2 Towers' },
      { type: 'count', kinds: ['fence'], min: 6, label: '6 Fences' },
      { type: 'count', kinds: ['path'], min: 4, label: '4 Paths' },
      {
        type: 'adjacent',
        kind: 'tower',
        to: ['path'],
        label: 'Every Tower next to a Path',
      },
    ],
  },
  {
    id: 3,
    title: 'Flower Park',
    blurb: 'Flower beds and shady trees around a wishing well.',
    targets: [
      { type: 'count', kinds: ['flowers'], min: 8, label: '8 Flowers' },
      { type: 'count', kinds: ['tree'], min: 4, label: '4 Trees' },
      { type: 'count', kinds: ['well'], min: 1, label: '1 Well' },
      { type: 'count', kinds: ['path'], min: 6, label: '6 Paths' },
    ],
  },
];

export function challengeById(id: number): Challenge {
  return CHALLENGES[id] ?? CHALLENGES[0];
}
