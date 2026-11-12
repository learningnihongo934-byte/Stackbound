// Arena (playset) ids and the names board events take in each one.
import type { BoardEvent, Dir, EventKind, PlayerId } from '../engine/types';

export type ArenaId = 'attic' | 'toychest' | 'bookshelf' | 'dollhouse' | 'trainset' | 'musicbox' | 'lampcorner' | 'windowsill' | 'oldtrunk';
export const ARENA_IDS: ArenaId[] = ['attic', 'toychest', 'bookshelf', 'dollhouse', 'trainset', 'musicbox', 'lampcorner', 'windowsill', 'oldtrunk'];
export const ZONE_ARENA: ArenaId[] = ['toychest', 'bookshelf', 'dollhouse', 'trainset', 'musicbox', 'lampcorner', 'windowsill', 'oldtrunk'];
export const ARENA_NAME: Record<ArenaId, string> = {
  attic: 'The Attic', toychest: 'Toy Chest', bookshelf: 'Bookshelf', dollhouse: 'Dollhouse', trainset: 'Train Set',
  musicbox: 'Music Box', lampcorner: 'Lamp Corner', windowsill: 'Window Sill', oldtrunk: 'Old Trunk',
};

const PAW: Record<ArenaId, string> = {
  attic: 'Cat\'s Paw', toychest: 'Lid Slam', bookshelf: 'Falling Book', dollhouse: 'Giant Hand', trainset: 'Train Crossing',
  musicbox: 'Crescendo', lampcorner: 'Power Surge', windowsill: 'Lightning Strike', oldtrunk: 'The King\'s Stomp',
};

export function eventName(e: BoardEvent, arena: ArenaId): string {
  switch (e.kind) {
    case 'paw': return PAW[arena];
    case 'draft': return arena === 'windowsill' ? 'Gust' : arena === 'trainset' ? 'Rush of Air' : 'Draft';
    case 'glitter': return arena === 'musicbox' ? 'Confetti' : 'Glitter Rain';
    case 'windup': return 'Wind-Up';
    case 'cleanup': return 'Spring Cleaning';
  }
}

export function eventText(e: BoardEvent, me: PlayerId): string {
  const rel = (d: Dir) => {
    const fwd: Dir = me === 0 ? 0 : 2;
    if (d === fwd) return 'toward them';
    if (d === ((fwd + 2) % 4)) return 'toward you';
    return (me === 0 ? d === 1 : d === 3) ? 'right' : 'left';
  };
  const row = (r: number) => (me === 0 ? r + 1 : 5 - r);
  const t: Record<EventKind, string> = {
    paw: `3 damage to every stack in row ${row(e.row ?? 2)} (counting from your side).`,
    draft: `Every stack slides 1 tile ${rel(e.dir ?? 0)}.`,
    glitter: '3 random tiles get random terrain.',
    windup: 'Every stack gets +1 action on its next turn.',
    cleanup: 'All terrain and hidden traps get swept away.',
  };
  return t[e.kind];
}
