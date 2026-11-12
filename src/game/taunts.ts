// What campaign opponents say during a duel.
export type Mood = 'gloat' | 'hurt' | 'smug' | 'ouch' | 'desperate' | 'win' | 'lose' | 'fuse';

const GENERIC: Record<Mood, string[]> = {
  gloat: ['Into the toy box with you!', 'That one\'s going back on the shelf.', 'Did that hurt? It looked like it hurt.', 'One less toy for you!', 'Snap! Ha!'],
  hurt: ['Hey! That was my favourite!', 'Rude!', 'I\'ll glue it back together later.', 'Lucky shot.', 'You\'ll pay for that!'],
  smug: ['Never turn your back on me.', 'Behind you!', 'Should\'ve watched your back.', 'Too slow!'],
  ouch: ['Ow, my back!', 'Sneaky!', 'That\'s cheating! Probably.', 'I was facing the other way!'],
  desperate: ['This isn\'t over!', 'I\'ve still got tricks!', 'Okay, okay, now I\'m worried.', 'Stay calm. Stay wound up.'],
  win: ['Back in the box you go!', 'Better luck next wind-up.', 'The attic is mine!'],
  lose: ['Unwound...', 'Fine. You win this round.', 'I\'ll be back after a repair.'],
  fuse: ['Look what I can make!', 'Bigger and better!', 'Evolution time!'],
};

const BOSS: Record<string, Partial<Record<Mood, string[]>>> = {
  '0-3': { gloat: ['Stand down, soldier!', 'The chest is closed to you!'], lose: ['At ease... you\'ve earned it.'] },
  '1-3': { gloat: ['Your fine is overdue.', 'Shh! Shhh!'], hurt: ['You dog-eared my page!'], lose: ['Fine. Fines waived.'] },
  '2-3': { gloat: ['Mind the china, darling.'], hurt: ['How common!'], lose: ['Darling, you\'ve chipped me.'] },
  '3-3': { gloat: ['Next stop: defeat!', 'All aboard!'], hurt: ['Delays on the line!'], lose: ['End of the line...'] },
  '4-3': { gloat: ['Encore! Encore!', 'Take a bow... forever.'], hurt: ['You missed a step!'], lose: ['The curtain falls.'] },
  '5-3': { gloat: ['Into the dark with you.', 'I\'ve burned brighter.'], hurt: ['My wick!'], lose: ['Lights... out.'] },
  '6-3': { gloat: ['Nothing gets past the glass.', 'Rain check: denied.'], hurt: ['A crack in the pane!'], lose: ['The window opens...'] },
  '7-3': { gloat: ['Every lost toy answers to me.', 'Join my collection.'], hurt: ['Impossible!'], desperate: ['I am the oldest toy in this attic!'], lose: ['Then... you are king now.'] },
};

const recent: string[] = [];
export function line(mood: Mood, oppId?: string): string {
  const pool = [...(oppId && BOSS[oppId]?.[mood] || []), ...GENERIC[mood]];
  const fresh = pool.filter(l => !recent.includes(l));
  const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
  recent.push(pick);
  if (recent.length > 6) recent.shift();
  return pick;
}
