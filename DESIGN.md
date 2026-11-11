# Stackbound — Design (v1)

Working title. A creature TCG set in a giant attic: cards are 32×32 pixel art, and when summoned
the pixels rise off the card into **living voxel toys** that fight on a 3D grid.

Web game at `stackbound.rennko.tech`, listed in Rennko Arcade. PvE first; PvP in v2.

---

## 1. Decisions (from Q&A, 2026-11-11)

| # | Topic | Choice |
|---|-------|--------|
| 1 | Stack height | 3 max |
| 2 | Summon cost | Growing energy, stacking is 1 cheaper |
| 3 | Win | Life points |
| 4 | Turns | Alternating |
| 5 | Grid | One shared 5×5 |
| 6 | Card types | Creatures, Spells, Traps, Terrain, Gear |
| 7 | Evolution | Stack to evolve (fuse) |
| 8 | Camera | Isometric, with cinematic close-ups |
| 9 | Setting | Mythic toy-box |
| 10 | Card count | 60+ |
| 11 | Collecting | Earned packs, campaign rewards, crafting, starter decks |
| 12 | Saving | Local + optional Google login |
| — | Art | Classic dueling-card frame (original design), 32×32 pixel art; voxel 3D in battle |

---

## 2. Match setup

- **Life:** 20 each.
- **Main deck:** 30 cards, max 2 copies of a card. **Evolution pile:** up to 8 Stage 2/3 cards. These are never drawn and are only reached by fusing.
- Opening hand: 5. Draw 1 at the start of each turn (the first player skips turn 1's draw).
- **Energy:** you get N energy on turn N, capped at 10. Energy you don't spend is lost.
- **Board:** a shared 5×5 grid. Your **home row** is the edge nearest you. You may summon on your home row or the row in front of it.

## 3. Stacks

- A tile holds one stack of 1–3 creatures.
- **Lead** (top creature): moves, attacks and takes hits first. Its stats, attack shape and type are the stack's.
- **Support** (creatures under the lead): each has a passive *Support* ability that only works while it's under something (for example "+1 Power to lead" or "lead can't be turned by enemies").
- **Stacking:** play a creature onto your own stack for 1 less energy (minimum 0). It becomes the new lead.
- **Spill:** damage left over after the lead falls carries down to the next creature. When the last creature falls, the stack topples (shown as a voxel collapse).
- The whole stack shares one **facing** (N/E/S/W).

## 4. Evolution: fuse

- If the top two creatures in a stack are the **same family and stage**, pay the fuse cost to replace both with the next stage from your Evolution pile.
  - Stage 1 + Stage 1 → Stage 2
  - Stage 2 + Stage 1 of the same family → Stage 3
- Fusing **frees a stack slot**, so a stack can grow tall, fuse, and grow again.
- The fused creature arrives at full HP and can act this turn if the stack hasn't attacked.
- Presentation: the camera swoops in and the two voxel models melt together and rebuild as the new form.

## 5. Turn order

1. **Draw** a card and refill energy.
2. **Main phase**, in any order:
   - Play cards: summon, stack, spell, set a trap, terrain, gear, fuse.
   - Each stack gets **2 actions**: Move 1 tile (orthogonal), Turn 90°, or Turn 180°. **Attack** takes both remaining actions and must be the stack's last action.
   - A newly summoned stack can Turn but not Move or Attack this turn.
3. **End.** End-of-turn effects resolve.

## 6. Combat

- **Attack shapes** come from the lead creature (gear can change them):
  - **Jab**: the tile in front.
  - **Line**: straight ahead up to the creature's Range, stopping at the first stack.
  - **Cone**: 3 tiles fanned out in front.
  - **Lob**: lands exactly 2 tiles ahead, over anything in between.
  - **Splash**: one tile within Range, plus the tiles next to it at half damage.
  - **Sweep**: the left, front and right tiles.
- **Facing damage**: front hit ×1, side hit ×1.5, back hit ×2 (round down).
- **Type advantage**: ×1.5, applied after facing.
- **Hitting the player**: a stack standing on the enemy's home row can attack the enemy player directly for its Power instead of attacking a tile. Turtling on your own home row blocks this.
- **Types:** Ember → Moss → Tide → Ember (a triangle), plus Volt → Stone → Gleam → Volt (a second triangle). Each type is neutral against the other triangle, so mixed decks are possible.

## 7. Other card types

- **Spell**: one-time effect, played in your main phase (damage, heal, rotate an enemy stack, push, draw).
- **Trap**: set face-down on any empty tile for its cost. It triggers when an enemy stack moves onto it or attacks it (spring, rotate, freeze for a turn, swap the top two creatures in the stack). Each player can have up to 3 traps set.
- **Terrain**: changes a tile's type, for example Lava (Ember) or Puddle (Tide). A lead whose type matches the tile gets +1 Power and +1 HP; a lead weak to it gets −1 Power. Only one terrain per tile; new terrain replaces the old.
- **Gear**: attached to a lead. It changes the attack shape, adds armour, or adds a back-guard (back hits count as side hits). It's discarded if that lead falls or gets fused.

## 8. Card frame (original design)

A classic dueling-card layout that doesn't copy any existing game's frame:

- A name banner across the top, with the type gem and energy cost.
- A 32×32 art window scaled up crisp, with a family/stage ribbon.
- An attack-shape diagram (a tiny 3×3 icon) with Range and Speed.
- An effect text box: the Support ability plus any active effect.
- A stat bar: **POW / HP**.
- Frame colour by card type: creature (warm brown), spell (teal), trap (plum), terrain (moss), gear (steel). Foil variants have animated pixel shimmer.

## 9. Voxel pipeline

- Every creature is drawn once as a 32×32 sprite in Pixeter.
- A build script **auto-voxelizes** it: each opaque pixel becomes a voxel column. Depth comes from the shade (darker pixels sit further back) and the model is mirrored for thickness. That means 60+ creatures don't each need a hand-built model.
- Final-stage creatures get a hand-tuned pass for extra detail.
- Rendering: Three.js `InstancedMesh`, one draw call per creature, so a full board stays cheap on phones.
- Summon animation: the card flips, its pixels lift off, and they snap into the voxel model on the tile.

## 10. Card set v1 (64 cards)

- **12 families × 3 stages = 36 creatures.** Stage 1 creatures go in the main deck; Stages 2 and 3 go in the Evolution pile. Two families per type.
- **28 non-creature cards:** 9 spells, 7 traps, 6 terrain, 6 gear.
- Every creature is a toy-box creature, for example:
  - **Ember:** Matchpup (a wind-up dog with a match tail) → Kilnhound → Furnacebrute. Another Ember family is Candlewick.
  - **Tide:** Bathtub Duckling → …; Snowglobe Jelly.
  - **Moss:** Felt Frog; Potted Mossling.
  - **Volt:** Battery Beetle; Lamp Moth.
  - **Stone:** Marble Golem; Domino Knight.
  - **Gleam:** Music-box Dancer; Prism Kite.

## 11. Progression

- **Start:** pick 1 of 3 starter decks: *Hearth* (Ember/Stone), *Tidepool* (Tide/Moss), *Sparkshelf* (Volt/Gleam).
- **Campaign:** 8 attic zones (Toy Chest, Bookshelf, Dollhouse, Train Set, Music Box, Lamp Corner, Window Sill, the Old Trunk), with 3 duels plus a boss in each. Beating a boss gives specific cards from that boss's deck.
- **Packs:** wins earn **Buttons**. A pack costs 100 Buttons and holds 5 cards with at least 1 uncommon. There's a reveal animation. No real money.
- **Crafting:** duplicates beyond 2 copies break down into **Stuffing**, which you spend to craft any card you've seen.
- **Rarities:** common, uncommon, rare, foil.

## 12. Tech

- Vite + vanilla TS + Three.js. The game rules are a pure, deterministic engine with a seeded RNG, kept separate from the renderer. That makes it testable and ready for lockstep PvP later (reusing the Pixel Conquest approach).
- AI: greedy one-ply search over legal actions with a scoring heuristic. Difficulty depends on the depth and the noise added.
- Saving: localStorage, plus optional Google sign-in to sync the collection. The backend is still to be decided: Rennko Cloud or Firebase.
- Hosting: Cloudflare at `stackbound.rennko.tech`, plus a card in Rennko Arcade.

## 13. Build order

1. Rules engine and tests (grid, stacks, facing, shapes, spill, fuse, traps).
2. A rough flat 2D board to playtest the rules against the AI.
3. Card frame renderer, plus the first 3 families drawn in Pixeter.
4. Auto-voxelizer, the Three.js isometric board and the summon/fuse cinematics.
5. Campaign, packs, crafting, collection and deck builder.
6. The rest of the 64 cards, balance passes, deploy, Arcade card.
