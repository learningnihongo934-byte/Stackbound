import type { CardDef, Elem, SkillId } from './types';

// The v1 set: 64 cards.
//   10 evolution families x 3 stages (Stage 1 in the main deck, Stage 2/3 in the Evolution pile)
//   10 solo creatures, 8 spells, 5 traps, 6 terrain, 5 gear.

const C: CardDef[] = [
  // ---------------------------------------------------------------- EMBER
  { id: 'matchpup', name: 'Matchpup', kind: 'creature', elem: 'ember', rarity: 'common', cost: 1, family: 'matchpup', stage: 1,
    power: 2, hp: 3, shape: 'jab', range: 1, support: { power: 1 }, supportText: 'Kindling: the lead gets +1 Power.',
    text: '', flavor: 'Wind it up and it runs in circles until the match goes out.' },
  { id: 'kilnhound', name: 'Kilnhound', kind: 'creature', elem: 'ember', rarity: 'uncommon', cost: 3, family: 'matchpup', stage: 2,
    power: 4, hp: 7, shape: 'cone', range: 1, kw: ['charge'], support: { power: 1 }, supportText: 'Kindling: the lead gets +1 Power.',
    text: '', flavor: 'Its tin coat stays warm for hours after a fight.' },
  { id: 'furnacebrute', name: 'Furnacebrute', kind: 'creature', elem: 'ember', rarity: 'rare', cost: 4, family: 'matchpup', stage: 3,
    power: 6, hp: 12, shape: 'sweep', range: 1, armor: 1, onPlay: { t: 'adjDamage', n: 2 },
    text: 'Eruption: when this arrives, deal 2 damage to each adjacent enemy stack.', flavor: 'The attic gets warmer whenever it wakes.' },

  { id: 'candlewick', name: 'Candlewick', kind: 'creature', elem: 'ember', rarity: 'common', cost: 2, family: 'candlewick', stage: 1,
    power: 2, hp: 3, shape: 'line', range: 2, support: { range: 1 }, supportText: 'Long Wick: the lead gets +1 Range.',
    text: '', flavor: 'Never blow it out. It remembers.' },
  { id: 'waxwarden', name: 'Waxwarden', kind: 'creature', elem: 'ember', rarity: 'uncommon', cost: 3, family: 'candlewick', stage: 2,
    power: 3, hp: 8, shape: 'line', range: 3, armor: 1, support: { range: 1 }, supportText: 'Long Wick: the lead gets +1 Range.',
    text: '', flavor: 'Drips slowly. Guards forever.' },
  { id: 'chandelord', name: 'Chandelord', kind: 'creature', elem: 'ember', rarity: 'rare', cost: 4, family: 'candlewick', stage: 3,
    power: 5, hp: 11, shape: 'splash', range: 3, onPlay: { t: 'draw', n: 1 }, support: { range: 1 }, supportText: 'Long Wick: the lead gets +1 Range.',
    text: 'Grand Entrance: when this arrives, draw a card.', flavor: 'Twelve flames, one temper.' },

  // ---------------------------------------------------------------- TIDE
  { id: 'bathduck', name: 'Bathduck', kind: 'creature', elem: 'tide', rarity: 'common', cost: 1, family: 'bathduck', stage: 1,
    power: 1, hp: 4, shape: 'jab', range: 1, support: { cushion: 2 }, supportText: 'Squeaky: damage that spills down this stack is reduced by 2.',
    text: '', flavor: 'Squeak once for yes. Squeak twice for attack.' },
  { id: 'tubdrake', name: 'Tubdrake', kind: 'creature', elem: 'tide', rarity: 'uncommon', cost: 3, family: 'bathduck', stage: 2,
    power: 3, hp: 8, shape: 'line', range: 2, regen: 1, support: { cushion: 2 }, supportText: 'Squeaky: damage that spills down this stack is reduced by 2.',
    text: '', flavor: 'Bath time is over when it says so.' },
  { id: 'leviathub', name: 'Leviathub', kind: 'creature', elem: 'tide', rarity: 'rare', cost: 5, family: 'bathduck', stage: 3,
    power: 6, hp: 13, shape: 'sweep', range: 1, regen: 2, kw: ['heavy'],
    text: '', flavor: 'Somewhere under the bubbles is a very old duck.' },

  { id: 'globjelly', name: 'Globjelly', kind: 'creature', elem: 'tide', rarity: 'common', cost: 2, family: 'globjelly', stage: 1,
    power: 2, hp: 3, shape: 'splash', range: 2, support: { thorns: 1 }, supportText: 'Stinger: the lead gets Thorns 1.',
    text: '', flavor: 'Shake it and it snows. Shake it twice and it stings.' },
  { id: 'domejelly', name: 'Domejelly', kind: 'creature', elem: 'tide', rarity: 'uncommon', cost: 3, family: 'globjelly', stage: 2,
    power: 3, hp: 7, shape: 'splash', range: 2, thorns: 1, support: { thorns: 1 }, supportText: 'Stinger: the lead gets Thorns 1.',
    text: '', flavor: 'A whole winter, sealed in glass, drifting.' },
  { id: 'abyssglobe', name: 'Abyssglobe', kind: 'creature', elem: 'tide', rarity: 'rare', cost: 4, family: 'globjelly', stage: 3,
    power: 5, hp: 10, shape: 'splash', range: 3, thorns: 2, onPlay: { t: 'adjFreeze' },
    text: 'Deep Chill: when this arrives, freeze each adjacent enemy stack.', flavor: 'It glows in the dark of the old trunk.' },

  // ---------------------------------------------------------------- MOSS
  { id: 'feltfrog', name: 'Feltfrog', kind: 'creature', elem: 'moss', rarity: 'common', cost: 1, family: 'feltfrog', stage: 1,
    power: 1, hp: 3, shape: 'lob', range: 2, kw: ['hop'], support: { regen: 1 }, supportText: 'Stuffing: the lead heals 1 at the start of your turn.',
    text: '', flavor: 'Hand-stitched, slightly lopsided, very bouncy.' },
  { id: 'quiltoad', name: 'Quiltoad', kind: 'creature', elem: 'moss', rarity: 'uncommon', cost: 3, family: 'feltfrog', stage: 2,
    power: 3, hp: 7, shape: 'lob', range: 2, kw: ['hop'], support: { regen: 1 }, supportText: 'Stuffing: the lead heals 1 at the start of your turn.',
    text: '', flavor: 'Made from a grandmother\'s favourite blanket.' },
  { id: 'patchking', name: 'Patchking', kind: 'creature', elem: 'moss', rarity: 'rare', cost: 4, family: 'feltfrog', stage: 3,
    power: 5, hp: 11, shape: 'lob', range: 3, regen: 1, kw: ['hop'], onPlay: { t: 'draw', n: 1 },
    text: 'Royal Leap: when this arrives, draw a card.', flavor: 'Every patch is a battle it won.' },

  { id: 'sproutpot', name: 'Sproutpot', kind: 'creature', elem: 'moss', rarity: 'common', cost: 2, family: 'sproutpot', stage: 1,
    power: 1, hp: 5, shape: 'jab', range: 1, support: { armor: 1 }, supportText: 'Terracotta: the lead gets Armor 1.',
    text: '', flavor: 'Water it daily. Do not ask what it eats.' },
  { id: 'thornpot', name: 'Thornpot', kind: 'creature', elem: 'moss', rarity: 'uncommon', cost: 3, family: 'sproutpot', stage: 2,
    power: 3, hp: 9, shape: 'sweep', range: 1, thorns: 2, support: { armor: 1 }, supportText: 'Terracotta: the lead gets Armor 1.',
    text: '', flavor: 'It grew in the dark and came out prickly.' },
  { id: 'arborpot', name: 'Arborpot', kind: 'creature', elem: 'moss', rarity: 'rare', cost: 5, family: 'sproutpot', stage: 3,
    power: 5, hp: 14, shape: 'sweep', range: 1, thorns: 2, armor: 1, kw: ['heavy'],
    text: '', flavor: 'A whole tree in a teacup-sized pot. Nobody knows how.' },

  // ---------------------------------------------------------------- VOLT
  { id: 'battbug', name: 'Battbug', kind: 'creature', elem: 'volt', rarity: 'common', cost: 2, family: 'battbug', stage: 1,
    power: 2, hp: 2, shape: 'line', range: 2, support: { actions: 1 }, supportText: 'Jumpstart: the lead gets +1 action each turn.',
    text: '', flavor: 'Fully charged. Mostly.' },
  { id: 'voltbeetle', name: 'Voltbeetle', kind: 'creature', elem: 'volt', rarity: 'uncommon', cost: 3, family: 'battbug', stage: 2,
    power: 4, hp: 6, shape: 'line', range: 3, kw: ['pierce'], support: { actions: 1 }, supportText: 'Jumpstart: the lead gets +1 action each turn.',
    text: '', flavor: 'Lick it once. Never again.' },
  { id: 'gigascarab', name: 'Gigawatt Scarab', kind: 'creature', elem: 'volt', rarity: 'rare', cost: 5, family: 'battbug', stage: 3,
    power: 6, hp: 10, shape: 'line', range: 4, kw: ['pierce', 'swift'],
    text: '', flavor: 'The lights flicker when it walks past.' },

  { id: 'lampmoth', name: 'Lampmoth', kind: 'creature', elem: 'volt', rarity: 'common', cost: 1, family: 'lampmoth', stage: 1,
    power: 1, hp: 2, shape: 'cone', range: 1, kw: ['hop'], support: { range: 1 }, supportText: 'Glow: the lead gets +1 Range.',
    text: '', flavor: 'Follows any light. Including yours.' },
  { id: 'bulbmoth', name: 'Bulbmoth', kind: 'creature', elem: 'volt', rarity: 'uncommon', cost: 2, family: 'lampmoth', stage: 2,
    power: 3, hp: 5, shape: 'cone', range: 1, kw: ['hop'], support: { range: 1 }, supportText: 'Glow: the lead gets +1 Range.',
    text: '', flavor: 'Sixty watts of pure attitude.' },
  { id: 'arclight', name: 'Arclight Moth', kind: 'creature', elem: 'volt', rarity: 'rare', cost: 4, family: 'lampmoth', stage: 3,
    power: 5, hp: 8, shape: 'cone', range: 1, kw: ['hop', 'swift'], onPlay: { t: 'adjDamage', n: 1 },
    text: 'Flash: when this arrives, deal 1 damage to each adjacent enemy stack.', flavor: 'Look directly at it. We dare you.' },

  // ---------------------------------------------------------------- STONE
  { id: 'marblet', name: 'Marblet', kind: 'creature', elem: 'stone', rarity: 'common', cost: 2, family: 'marblet', stage: 1,
    power: 2, hp: 4, shape: 'jab', range: 1, armor: 1, support: { armor: 1 }, supportText: 'Glassy: the lead gets Armor 1.',
    text: '', flavor: 'Lost under the couch for six years. Came back stronger.' },
  { id: 'rollgolem', name: 'Rollgolem', kind: 'creature', elem: 'stone', rarity: 'uncommon', cost: 3, family: 'marblet', stage: 2,
    power: 4, hp: 9, shape: 'jab', range: 1, armor: 1, kw: ['charge'], support: { armor: 1 }, supportText: 'Glassy: the lead gets Armor 1.',
    text: '', flavor: 'Never stops. Cannot stop. Please move.' },
  { id: 'monolith', name: 'Monolith', kind: 'creature', elem: 'stone', rarity: 'rare', cost: 5, family: 'marblet', stage: 3,
    power: 6, hp: 15, shape: 'sweep', range: 1, armor: 2, kw: ['heavy'],
    text: '', flavor: 'Every marble ever lost, rolled into one.' },

  // ---------------------------------------------------------------- GLEAM
  { id: 'twirla', name: 'Twirla', kind: 'creature', elem: 'gleam', rarity: 'common', cost: 2, family: 'twirla', stage: 1,
    power: 2, hp: 3, shape: 'sweep', range: 1, support: { backGuard: true }, supportText: 'Pirouette: hits to this stack\'s back count as side hits.',
    text: '', flavor: 'Open the lid and she never stops spinning.' },
  { id: 'prismelle', name: 'Prismelle', kind: 'creature', elem: 'gleam', rarity: 'uncommon', cost: 3, family: 'twirla', stage: 2,
    power: 4, hp: 7, shape: 'sweep', range: 1, kw: ['swift'], support: { backGuard: true }, supportText: 'Pirouette: hits to this stack\'s back count as side hits.',
    text: '', flavor: 'Her skirt throws rainbows on the rafters.' },
  { id: 'celestelle', name: 'Celestelle', kind: 'creature', elem: 'gleam', rarity: 'rare', cost: 5, family: 'twirla', stage: 3,
    power: 6, hp: 11, shape: 'sweep', range: 1, kw: ['swift'], onPlay: { t: 'healAll', n: 3 },
    text: 'Encore: when this arrives, heal 3 to each of your stacks.', flavor: 'The music box plays a song nobody wrote.' },

  // ---------------------------------------------------------------- SOLOS
  { id: 'sparkjack', name: 'Sparkjack', kind: 'creature', elem: 'ember', rarity: 'uncommon', cost: 3,
    power: 4, hp: 4, shape: 'lob', range: 3, kw: ['burst'], support: { power: 1 }, supportText: 'Fuse: the lead gets +1 Power.',
    text: '', flavor: 'Pop goes the weasel. Then everything else.' },
  { id: 'spritzfin', name: 'Spritzfin', kind: 'creature', elem: 'tide', rarity: 'uncommon', cost: 3,
    power: 3, hp: 5, shape: 'line', range: 4, support: { range: 1 }, supportText: 'Pressure: the lead gets +1 Range.',
    text: '', flavor: 'Pump the tail. Aim. Regret nothing.' },
  { id: 'mossbear', name: 'Mossbear', kind: 'creature', elem: 'moss', rarity: 'uncommon', cost: 4,
    power: 3, hp: 9, shape: 'jab', range: 1, regen: 2, kw: ['heavy'], support: { regen: 1 }, supportText: 'Hug: the lead heals 1 at the start of your turn.',
    text: '', flavor: 'Left in the garden one summer. Something grew back.' },
  { id: 'ziprover', name: 'Zip Rover', kind: 'creature', elem: 'volt', rarity: 'rare', cost: 3,
    power: 3, hp: 4, shape: 'jab', range: 1, kw: ['swift', 'charge'], support: { power: 1 }, supportText: 'Turbo: the lead gets +1 Power.',
    text: '', flavor: 'The remote was lost years ago. It drives itself now.' },
  { id: 'dominoknight', name: 'Domino Knight', kind: 'creature', elem: 'stone', rarity: 'uncommon', cost: 3,
    power: 3, hp: 6, shape: 'line', range: 2, armor: 1, kw: ['pierce'], support: { armor: 1 }, supportText: 'Shield Wall: the lead gets Armor 1.',
    text: '', flavor: 'When it falls, everything behind it falls too.' },
  { id: 'rookwall', name: 'Rookwall', kind: 'creature', elem: 'stone', rarity: 'rare', cost: 4,
    power: 2, hp: 10, shape: 'jab', range: 1, armor: 2, kw: ['heavy'], support: { anchor: true }, supportText: 'Anchor: this stack can\'t be pushed or turned by enemies.',
    text: '', flavor: 'Castles move in straight lines. This one doesn\'t move at all.' },
  { id: 'piggyvault', name: 'Piggy Vault', kind: 'creature', elem: 'stone', rarity: 'common', cost: 2,
    power: 1, hp: 6, shape: 'jab', range: 1, onPlay: { t: 'draw', n: 1 }, support: { cushion: 3 }, supportText: 'Padded: damage that spills down this stack is reduced by 3.',
    text: 'Coin Drop: when this arrives, draw a card.', flavor: 'Rattles when it walks. Fourteen cents, mostly buttons.' },
  { id: 'prismkite', name: 'Prism Kite', kind: 'creature', elem: 'gleam', rarity: 'uncommon', cost: 3,
    power: 3, hp: 4, shape: 'line', range: 3, kw: ['hop'], support: { range: 1 }, supportText: 'Updraft: the lead gets +1 Range.',
    text: '', flavor: 'It escaped the window one windy day and came back different.' },
  { id: 'kaleidowl', name: 'Kaleidowl', kind: 'creature', elem: 'gleam', rarity: 'rare', cost: 4,
    power: 4, hp: 6, shape: 'cone', range: 1, onPlay: { t: 'draw', n: 1 }, support: { backGuard: true }, supportText: 'All-Seeing: hits to this stack\'s back count as side hits.',
    text: 'Insight: when this arrives, draw a card.', flavor: 'It sees in a hundred colours. Mostly yours.' },
  { id: 'glimmersnail', name: 'Glimmer Snail', kind: 'creature', elem: 'gleam', rarity: 'common', cost: 2,
    power: 1, hp: 5, shape: 'jab', range: 1, armor: 2, support: { thorns: 1 }, supportText: 'Spiral: the lead gets Thorns 1.',
    text: '', flavor: 'Leaves a trail of glitter nobody can vacuum up.' },

  // ---------------------------------------------------------------- SPELLS
  { id: 'pillowfight', name: 'Pillow Fight', kind: 'spell', rarity: 'common', cost: 1, target: 'enemy', fx: { t: 'damage', n: 2 },
    text: 'Deal 2 damage to an enemy stack.', flavor: 'Feathers everywhere. Feelings hurt.' },
  { id: 'marblerush', name: 'Marble Rush', kind: 'spell', rarity: 'uncommon', cost: 3, target: 'column', fx: { t: 'column', n: 2 },
    text: 'Pick a column. Deal 2 damage to every enemy stack in it.', flavor: 'Someone kicked the jar.' },
  { id: 'spintop', name: 'Spin Top', kind: 'spell', rarity: 'common', cost: 1, target: 'enemy', fx: { t: 'rotate' }, dirParam: true,
    text: 'Turn an enemy stack to face any direction.', flavor: 'Round and round and... which way was forward?' },
  { id: 'shove', name: 'Shove', kind: 'spell', rarity: 'common', cost: 1, target: 'any', fx: { t: 'push' }, dirParam: true,
    text: 'Push a stack 1 tile. If it can\'t move, it takes 1 damage instead.', flavor: 'Excuse me. Coming through.' },
  { id: 'gluepot', name: 'Glue Pot', kind: 'spell', rarity: 'uncommon', cost: 2, target: 'enemy', fx: { t: 'freeze' },
    text: 'Freeze an enemy stack: it gets no actions this turn or its next turn.', flavor: 'Non-toxic. Extremely sticky.' },
  { id: 'rummage', name: 'Rummage', kind: 'spell', rarity: 'common', cost: 2, target: 'none', fx: { t: 'draw', n: 2 },
    text: 'Draw 2 cards.', flavor: 'It\'s in here somewhere.' },
  { id: 'patchup', name: 'Patch Up', kind: 'spell', rarity: 'common', cost: 2, target: 'own', fx: { t: 'heal', n: 5 },
    text: 'Heal 5 damage on one of your stacks, from the top down.', flavor: 'A needle, some thread, and a lot of love.' },
  { id: 'windupkey', name: 'Wind-Up Key', kind: 'spell', rarity: 'uncommon', cost: 1, target: 'own', fx: { t: 'refresh', n: 2 },
    text: 'One of your stacks gets +2 actions this turn, even if it just arrived.', flavor: 'Click, click, click... GO.' },

  // ---------------------------------------------------------------- TRAPS
  { id: 'mousetrap', name: 'Mousetrap', kind: 'trap', rarity: 'common', cost: 1, trigger: 'enter', trapFx: 'mousetrap',
    text: 'Set on an empty tile. When an enemy stack enters it, deal 3 damage to that stack.', flavor: 'Snap.' },
  { id: 'jackspring', name: 'Jack Spring', kind: 'trap', rarity: 'common', cost: 1, trigger: 'enter', trapFx: 'spring',
    text: 'Set on an empty tile. When an enemy stack enters it, bounce it 2 tiles back toward its owner.', flavor: 'Boing.' },
  { id: 'tangleyarn', name: 'Tangle Yarn', kind: 'trap', rarity: 'uncommon', cost: 2, trigger: 'enter', trapFx: 'yarn',
    text: 'Set on an empty tile. When an enemy stack enters it, freeze that stack.', flavor: 'The cat did this.' },
  { id: 'mirrorshard', name: 'Mirror Shard', kind: 'trap', rarity: 'uncommon', cost: 2, trigger: 'attacked', trapFx: 'mirror',
    text: 'Set under one of your stacks. When it is attacked, the attacker takes the same damage.', flavor: 'What you see is what you get.' },
  { id: 'pillowfort', name: 'Pillow Fort', kind: 'trap', rarity: 'rare', cost: 2, trigger: 'attacked', trapFx: 'pillow',
    text: 'Set under one of your stacks. When it is attacked, it takes no damage from that attack.', flavor: 'No grown-ups allowed.' },

  // ---------------------------------------------------------------- TERRAIN
  { id: 'hotplate', name: 'Hot Plate', kind: 'terrain', elem: 'ember', rarity: 'common', cost: 1,
    text: 'Make a tile Ember terrain.', flavor: 'Do not touch. Seriously.' },
  { id: 'spilledtea', name: 'Spilled Tea', kind: 'terrain', elem: 'tide', rarity: 'common', cost: 1,
    text: 'Make a tile Tide terrain.', flavor: 'The tea party got out of hand.' },
  { id: 'gardenrug', name: 'Garden Rug', kind: 'terrain', elem: 'moss', rarity: 'common', cost: 1,
    text: 'Make a tile Moss terrain.', flavor: 'Woven grass, real dew.' },
  { id: 'tangledwires', name: 'Tangled Wires', kind: 'terrain', elem: 'volt', rarity: 'common', cost: 1,
    text: 'Make a tile Volt terrain.', flavor: 'Every plug in the attic, in one knot.' },
  { id: 'graveltray', name: 'Gravel Tray', kind: 'terrain', elem: 'stone', rarity: 'common', cost: 1,
    text: 'Make a tile Stone terrain.', flavor: 'From the old fish tank.' },
  { id: 'glitterspill', name: 'Glitter Spill', kind: 'terrain', elem: 'gleam', rarity: 'common', cost: 1,
    text: 'Make a tile Gleam terrain.', flavor: 'You will be finding this for years.' },

  // ---------------------------------------------------------------- GEAR
  { id: 'slingshot', name: 'Slingshot', kind: 'gear', rarity: 'common', cost: 1, gear: { shape: 'lob', range: 3 },
    text: 'The lead\'s attack becomes Lob with Range 3.', flavor: 'Pull back. Let go. Hope.' },
  { id: 'tinarmor', name: 'Tin Armor', kind: 'gear', rarity: 'common', cost: 2, gear: { armor: 2 },
    text: 'The lead gets Armor 2.', flavor: 'Made from a biscuit tin. Still smells of biscuits.' },
  { id: 'rearview', name: 'Rearview Mirror', kind: 'gear', rarity: 'uncommon', cost: 1, gear: { backGuard: true },
    text: 'Hits to this stack\'s back count as side hits.', flavor: 'Objects in mirror are angrier than they appear.' },
  { id: 'springshoes', name: 'Spring Shoes', kind: 'gear', rarity: 'uncommon', cost: 2, gear: { actions: 1 },
    text: 'The lead gets +1 action each turn.', flavor: 'Lace tight.' },
  { id: 'pinlance', name: 'Pin Lance', kind: 'gear', rarity: 'rare', cost: 2, gear: { shape: 'line', range: 3, pierce: true, power: 1 },
    text: 'The lead\'s attack becomes Line with Range 3 and Pierce. +1 Power.', flavor: 'A hat pin, lovingly sharpened.' },
];

export interface SkillDef { id: SkillId; name: string; energy: number; ap: number; text: string }
export const SKILLS: Record<SkillId, SkillDef> = {
  dash: { id: 'dash', name: 'Dash', energy: 0, ap: 1, text: 'Charge up to 2 tiles straight ahead.' },
  taunt: { id: 'taunt', name: 'Taunt', energy: 1, ap: 1, text: 'Adjacent enemies turn to face this stack.' },
  swap: { id: 'swap', name: 'Swap', energy: 0, ap: 1, text: 'Trade places with an adjacent ally.' },
  guard: { id: 'guard', name: 'Guard', energy: 1, ap: 1, text: 'This stack and adjacent allies get Armor +1 until your next turn.' },
  mend: { id: 'mend', name: 'Mend', energy: 1, ap: 1, text: 'Heal 2 to this stack and each adjacent ally.' },
  zap: { id: 'zap', name: 'Zap', energy: 1, ap: 1, text: 'Deal 2 damage to an enemy within 2 tiles, any direction.' },
  bump: { id: 'bump', name: 'Bump', energy: 0, ap: 1, text: 'Push the enemy in front 1 tile back.' },
  rally: { id: 'rally', name: 'Rally', energy: 1, ap: 1, text: 'Each adjacent ally gets +1 action this turn.' },
  whirl: { id: 'whirl', name: 'Whirl', energy: 0, ap: 0, text: 'Turn to face any direction for free.' },
  brace: { id: 'brace', name: 'Brace', energy: 0, ap: 1, text: 'Get Armor +2 until your next turn.' },
};
const SKILL_OF: Record<string, SkillId> = {
  matchpup: 'dash', kilnhound: 'dash', furnacebrute: 'taunt', candlewick: 'zap', waxwarden: 'brace', chandelord: 'zap',
  bathduck: 'mend', tubdrake: 'mend', leviathub: 'taunt', globjelly: 'zap', domejelly: 'zap', abyssglobe: 'whirl',
  feltfrog: 'dash', quiltoad: 'swap', patchking: 'rally', sproutpot: 'brace', thornpot: 'taunt', arborpot: 'guard',
  battbug: 'rally', voltbeetle: 'dash', gigascarab: 'whirl', lampmoth: 'whirl', bulbmoth: 'zap', arclight: 'zap',
  marblet: 'bump', rollgolem: 'dash', monolith: 'guard', twirla: 'whirl', prismelle: 'whirl', celestelle: 'mend',
  sparkjack: 'zap', spritzfin: 'bump', mossbear: 'guard', ziprover: 'dash', dominoknight: 'bump', rookwall: 'guard',
  piggyvault: 'brace', prismkite: 'swap', kaleidowl: 'whirl', glimmersnail: 'brace',
};
for (const c of C) if (c.kind === 'creature') c.skill = SKILL_OF[c.id];

export const CARDS: Record<string, CardDef> = Object.fromEntries(C.map(c => [c.id, c]));
export const ALL_CARDS = C;
export const card = (id: string): CardDef => {
  const c = CARDS[id];
  if (!c) throw new Error('unknown card ' + id);
  return c;
};

export const ELEMS: Elem[] = ['ember', 'tide', 'moss', 'volt', 'stone', 'gleam'];
export const ELEM_NAME: Record<Elem, string> = { ember: 'Ember', tide: 'Tide', moss: 'Moss', volt: 'Volt', stone: 'Stone', gleam: 'Gleam' };
/** BEATS[a] = the element a deals x1.5 damage to. */
export const BEATS: Record<Elem, Elem> = { ember: 'moss', moss: 'tide', tide: 'ember', volt: 'stone', stone: 'gleam', gleam: 'volt' };

export const KEYWORD_TEXT: Record<string, string> = {
  swift: 'Swift: +1 action each turn.',
  hop: 'Hop: can move diagonally and ignores Snare traps.',
  pierce: 'Pierce: Line attacks pass through stacks and hit every enemy in range.',
  charge: 'Charge: +2 Power if this stack moved this turn.',
  heavy: 'Heavy: can\'t be pushed or turned by enemies.',
  burst: 'Burst: when this falls, deal 2 damage to each adjacent enemy stack.',
};

export const SHAPE_TEXT: Record<string, string> = {
  jab: 'Jab: hits the tile in front.',
  line: 'Line: shoots straight ahead up to its Range and stops at the first stack.',
  cone: 'Cone: hits the three tiles fanned out in front.',
  lob: 'Lob: lands on a tile 2 or more ahead (up to Range), over anything in between.',
  splash: 'Splash: hits a tile ahead within Range, plus the tiles around it for half damage.',
  sweep: 'Sweep: hits the tiles to the left, front and right.',
};

/** Next stage in a family, if any. */
export function nextStage(family: string, stage: number): CardDef | undefined {
  return C.find(c => c.family === family && c.stage === stage + 1);
}
export function familyOf(family: string): CardDef[] {
  return C.filter(c => c.family === family).sort((a, b) => (a.stage || 0) - (b.stage || 0));
}
export const isEvo = (c: CardDef) => c.kind === 'creature' && (c.stage || 1) > 1;

export function rulesText(c: CardDef): string[] {
  const out: string[] = [];
  if (c.kind === 'creature') {
    if (c.text) out.push(c.text);
    if (c.skill) { const sk = SKILLS[c.skill]; out.push(`Skill — ${sk.name}${sk.energy ? ` (${sk.energy})` : ''}: ${sk.text}`); }
    for (const k of c.kw || []) out.push(KEYWORD_TEXT[k]);
    if (c.armor) out.push(`Armor ${c.armor}: takes ${c.armor} less damage from each hit.`);
    if (c.thorns) out.push(`Thorns ${c.thorns}: adjacent attackers take ${c.thorns} damage.`);
    if (c.regen) out.push(`Regen ${c.regen}: heals ${c.regen} at the start of your turn.`);
    if (c.supportText) out.push('Under: ' + c.supportText);
  } else out.push(c.text);
  return out;
}
