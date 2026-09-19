// Lobby theme vote: options, idea cleanup, and the tally. Shared by the module, the
// client, and the tests. Pure TypeScript: must not import spacetimedb/server.
import { CHALLENGES } from './challenges';

export const BATTLE_THEMES = [
  'Haunted Forest',
  'Royal Castle',
  'Zen Garden',
  'Seaside Village',
  'Tiny Town',
] as const;

export const MAX_IDEA_LENGTH = 40;

export type OptionKind = 'challenge' | 'battle' | 'idea';

export interface ParsedOption {
  kind: OptionKind;
  id: number;
}

export function optionKey(kind: OptionKind, id: number | bigint): string {
  return `${kind}:${id}`;
}

export function parseOptionKey(key: string): ParsedOption | null {
  const match = /^(challenge|battle|idea):(\d+)$/.exec(key);
  if (!match) return null;
  return { kind: match[1] as OptionKind, id: Number(match[2]) };
}

/** Keys of the built-in options: every co-op challenge and every battle theme. */
export function presetOptionKeys(): string[] {
  return [
    ...CHALLENGES.map((c) => optionKey('challenge', c.id)),
    ...BATTLE_THEMES.map((_, i) => optionKey('battle', i)),
  ];
}

/** Trims, collapses whitespace, strips control characters; null if nothing is left. */
export function sanitizeIdea(raw: string): string | null {
  const text = raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_IDEA_LENGTH)
    .trim();
  return text.length > 0 ? text : null;
}

export function tallyVotes(votes: Iterable<string>): Map<string, number> {
  const tally = new Map<string, number>();
  for (const key of votes) tally.set(key, (tally.get(key) ?? 0) + 1);
  return tally;
}

/**
 * The most-voted option among `validKeys`, with ties broken by `random` (in [0, 1)).
 * Null when nobody voted for a valid option.
 */
export function pickWinner(
  tally: Map<string, number>,
  validKeys: Iterable<string>,
  random: () => number,
): string | null {
  const valid = new Set(validKeys);
  let best = 0;
  let leaders: string[] = [];
  for (const [key, count] of tally) {
    if (!valid.has(key) || count < best) continue;
    if (count > best) {
      best = count;
      leaders = [];
    }
    leaders.push(key);
  }
  if (leaders.length === 0) return null;
  leaders.sort();
  return leaders[Math.floor(random() * leaders.length)];
}
