// Core data types for the Stackbound rules engine. Everything here is plain JSON so a
// GameState can be cloned, sent to a worker, saved, or replayed deterministically.

export type Elem = 'ember' | 'tide' | 'moss' | 'volt' | 'stone' | 'gleam';
export type Shape = 'jab' | 'line' | 'cone' | 'lob' | 'splash' | 'sweep';
export type Kind = 'creature' | 'spell' | 'trap' | 'terrain' | 'gear';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Dir = 0 | 1 | 2 | 3; // 0 = N (+y, toward player 1), 1 = E (+x), 2 = S, 3 = W
export type PlayerId = 0 | 1;
export type Facing = 'front' | 'side' | 'back';

export type SkillId = 'dash' | 'taunt' | 'swap' | 'guard' | 'mend' | 'zap' | 'bump' | 'rally' | 'whirl' | 'brace';
export type EventKind = 'draft' | 'paw' | 'glitter' | 'windup' | 'cleanup';
export interface BoardEvent { kind: EventKind; turn: number; row?: number; dir?: Dir }

/** Keywords a lead creature can have. */
export type Keyword = 'swift' | 'hop' | 'pierce' | 'charge' | 'heavy' | 'burst';

/** Passive bonuses a creature gives to its stack while it sits under the lead. */
export interface SupportFx {
  power?: number; armor?: number; thorns?: number; regen?: number; actions?: number; range?: number;
  cushion?: number; backGuard?: boolean; anchor?: boolean;
}

export interface GearFx {
  shape?: Shape; range?: number; power?: number; armor?: number; actions?: number; backGuard?: boolean; pierce?: boolean;
}

export type Effect =
  | { t: 'damage'; n: number }
  | { t: 'heal'; n: number }
  | { t: 'healAll'; n: number }
  | { t: 'draw'; n: number }
  | { t: 'energy'; n: number }
  | { t: 'rotate' }
  | { t: 'push' }
  | { t: 'freeze' }
  | { t: 'refresh'; n: number }
  | { t: 'column'; n: number }
  | { t: 'adjDamage'; n: number }
  | { t: 'adjFreeze' };

export type SpellTarget = 'enemy' | 'own' | 'any' | 'column' | 'none';

export interface CardDef {
  id: string;
  name: string;
  kind: Kind;
  elem?: Elem;
  rarity: Rarity;
  cost: number;
  text: string;
  flavor: string;
  // creatures
  family?: string;
  stage?: 1 | 2 | 3;
  power?: number;
  hp?: number;
  shape?: Shape;
  range?: number;
  armor?: number;
  thorns?: number;
  regen?: number;
  kw?: Keyword[];
  support?: SupportFx;
  supportText?: string;
  onPlay?: Effect;
  skill?: SkillId;
  // spells
  target?: SpellTarget;
  fx?: Effect;
  dirParam?: boolean;
  // traps
  trigger?: 'enter' | 'attacked';
  trapFx?: 'mousetrap' | 'spring' | 'yarn' | 'mirror' | 'pillow';
  // gear
  gear?: GearFx;
}

export interface CardRef { uid: number; card: string }

export interface Unit { uid: number; card: string; hp: number; gear: string | null }

export interface Stack {
  id: number;
  owner: PlayerId;
  x: number;
  y: number;
  dir: Dir;
  units: Unit[]; // bottom -> top; last is the lead
  ap: number;
  moved: boolean;
  frozen: number;
  attacked: boolean;
  guard: number;
  skilled: boolean;
  bonusAp: number;
}

export interface Trap { owner: PlayerId; card: string; uid: number }
export interface Tile { terrain: Elem | null; trap: Trap | null }

export interface PlayerState {
  name: string;
  life: number;
  energy: number;
  maxEnergy: number;
  deck: CardRef[];
  hand: CardRef[];
  discard: string[];
  evo: CardRef[];
  fatigue: number;
  turns: number;
}

export interface GameState {
  rng: number;
  turn: number; // global turn counter, 1-based
  first: PlayerId;
  active: PlayerId;
  players: [PlayerState, PlayerState];
  stacks: Stack[];
  tiles: Tile[];
  nextId: number;
  winner: PlayerId | 'draw' | null;
  event: BoardEvent | null;
}

export interface DeckList { main: string[]; evo: string[] }

export type Action =
  | { k: 'end' }
  | { k: 'summon'; card: number; x: number; y: number; dir: Dir }
  | { k: 'stack'; card: number; stack: number }
  | { k: 'spell'; card: number; x?: number; y?: number; dir?: Dir }
  | { k: 'trap'; card: number; x: number; y: number }
  | { k: 'terrain'; card: number; x: number; y: number }
  | { k: 'gear'; card: number; stack: number }
  | { k: 'move'; stack: number; x: number; y: number }
  | { k: 'turn'; stack: number; dir: Dir }
  | { k: 'attack'; stack: number; x?: number; y?: number; player?: boolean }
  | { k: 'fuse'; stack: number }
  | { k: 'skill'; stack: number; x?: number; y?: number; dir?: Dir };

export type Ev =
  | { e: 'turn'; p: PlayerId; turn: number }
  | { e: 'draw'; p: PlayerId; card: string; uid: number }
  | { e: 'burn'; p: PlayerId; card: string }
  | { e: 'fatigue'; p: PlayerId; n: number }
  | { e: 'storm'; p: PlayerId; n: number }
  | { e: 'energy'; p: PlayerId; n: number }
  | { e: 'play'; p: PlayerId; card: string; uid: number }
  | { e: 'summon'; p: PlayerId; stack: number; x: number; y: number; dir: Dir; card: string; uid: number }
  | { e: 'stackOn'; p: PlayerId; stack: number; card: string; uid: number }
  | { e: 'fuse'; p: PlayerId; stack: number; from: [number, number]; card: string; uid: number }
  | { e: 'move'; stack: number; x: number; y: number; fx: number; fy: number }
  | { e: 'push'; stack: number; x: number; y: number; fx: number; fy: number; blocked: boolean }
  | { e: 'turnTo'; stack: number; dir: Dir }
  | { e: 'attack'; stack: number; shape: Shape; tiles: [number, number][]; player?: PlayerId }
  | { e: 'hit'; stack: number; uid: number; n: number; facing?: Facing; adv?: boolean; spill?: boolean; src?: number }
  | { e: 'ko'; stack: number; uid: number; card: string }
  | { e: 'topple'; stack: number; x: number; y: number; owner: PlayerId }
  | { e: 'heal'; stack: number; uid: number; n: number }
  | { e: 'playerHit'; p: PlayerId; n: number; src?: number }
  | { e: 'spell'; p: PlayerId; card: string; x?: number; y?: number }
  | { e: 'trapSet'; p: PlayerId; x: number; y: number; uid: number; card: string }
  | { e: 'trap'; p: PlayerId; card: string; x: number; y: number; stack: number }
  | { e: 'terrain'; x: number; y: number; elem: Elem; card: string }
  | { e: 'gear'; stack: number; card: string }
  | { e: 'freeze'; stack: number }
  | { e: 'refresh'; stack: number; n: number }
  | { e: 'blocked'; stack: number }
  | { e: 'skill'; stack: number; skill: SkillId; x?: number; y?: number }
  | { e: 'guard'; stack: number; n: number }
  | { e: 'point'; p: PlayerId; n: number }
  | { e: 'eventSoon'; ev: BoardEvent }
  | { e: 'boardEvent'; ev: BoardEvent }
  | { e: 'win'; p: PlayerId | 'draw' };

export interface Mods {
  power: number; armor: number; thorns: number; regen: number; actions: number; range: number;
  shape: Shape; pierce: boolean; backGuard: boolean; anchor: boolean; cushion: number; heavy: boolean; hop: boolean; burst: boolean;
}

export interface AttackOption {
  x?: number; y?: number; player?: boolean;
  tiles: [number, number][];
  hits: { stack: number; half: boolean }[];
}
