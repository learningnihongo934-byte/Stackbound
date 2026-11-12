# Stackbound

A creature trading card game where 32×32 pixel cards come alive as voxel toys on a 5×5 board. Stack creatures into towers, hit enemies from the side or from behind, and fuse two of a kind into their evolved form.

Play it at **https://stackbound.rennko.tech**.

## The game

- **64 cards**: 10 evolution families with 3 stages each, 10 solo creatures, 8 spells, 5 traps, 6 terrain cards and 5 gear cards.
- **Stacks**: up to 3 creatures share a tile. The top creature (the lead) fights. The ones underneath give it bonuses, and damage spills down through the stack.
- **Facing**: each stack faces one way. A hit from the side does ×1.5 damage, a hit from behind does ×2.
- **Fuse**: when the top two creatures of a stack are the same family and stage, they merge into the next stage from your Evolution pile.
- **Skills, gears and events**: every creature has a once-per-turn skill (Dash, Zap, Guard, Whirl…). Two brass gears in the middle row give +1 energy to whoever holds them. Every 5 turns a telegraphed board event hits (a cat's paw swipes a row, a draft shoves everything, glitter rains).
- **Campaign**: 8 zones, each its own playset arena (Toy Chest, Bookshelf, Dollhouse, Train Set, Music Box, Lamp Corner, Window Sill, Old Trunk), each with 3 duels and a boss. Opponents taunt and react.
- **Play a Friend**: room-code PvP with 60-second turns. A Durable Object runs the same rules engine on the server, so hidden cards and traps never reach the other player.
- **Juice**: animated voxel toys (walking, head-turning, wing-flapping, sleeping, reaction bubbles), hit-stop, camera punches, slow-motion knockouts, letterboxed fusion cinematics, slam-down summons, drag-to-play, holo cards and layered battle music.
- **Collection**: earn Buttons by winning to open packs, recycle extra copies into Stuffing, and craft any card. The deck builder has a mana curve and validation.
- **Saving**: everything is saved in the browser. Google sign-in (through Rennko Cloud) adds a backup that syncs across devices.

## How it's built

- `src/engine/` is a pure, deterministic rules engine (`apply(state, action) → { state, events }`). It also holds the card set, the decks and a greedy AI with a threat model that runs in a Web Worker and never sees your hidden traps.
- `src/art/` holds every creature and prop as a small voxel CSG script. The same model is raycast into the 32×32 card portrait (smoothed normals, colour ramps that shift hue in light and shadow, selective outlines) and meshed into the 3D battle model (baked per-vertex ambient occlusion). That way a card and its toy always match.
- `src/render/` is the Three.js stage. It has a procedural attic diorama, a camera rig with cinematic moves, voxel particle effects, and post-processing (bloom, tilt-shift, colour grade, vignette and grain).
- `src/ui/` is the DOM interface: screens, the card frame, the battle HUD and the tutorial coach.
- `src/game/` holds the profile, campaign, economy, cloud sync, PvP client and the Rennko Arcade score hook. Sound effects and music are synthesized live with WebAudio.
- `src/server/worker.ts` is the Cloudflare Worker: it serves the game and runs one Durable Object per PvP room.

## Build

```bash
./build.sh            # dev server on http://localhost:8820
./build.sh test       # type check + rules tests + 60 AI-vs-AI matches
./build.sh build      # production build into dist/
./build.sh deploy     # build and deploy to Cloudflare Workers (game + PvP rooms)
npx wrangler dev --port 8787   # local Worker for PvP; the Vite dev server proxies /api to it
npx vite-node tools/pvp-smoke.ts   # two bots play a full PvP match through the server
npx vite-node tools/preview.ts [filter]   # render card art contact sheet to tools/out/sheet.png
```

Made by **Virat Reddy Kaukuntla** ([@learningnihongo934-byte](https://github.com/learningnihongo934-byte))
