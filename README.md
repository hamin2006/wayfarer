# ⚔️ Wayfarer

A forever-expanding 3D action RPG in the browser. You start in a small village at the centre of an infinite, procedurally generated world. The further you roam, the stranger the biomes, the tougher the monsters and the better the loot.

## Play

```bash
npm install
npm run dev
```

Open the printed `Local` URL. To play on your phone, connect it to the same Wi-Fi and open the `Network` URL. Progress saves automatically in the browser.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Drag anywhere on the left (floating joystick) |
| Basic attack | Automatic when enemies are in reach | Same |
| Arcane Bolt | Left-click (aims at cursor) or `E` | ✨ button (auto-aims) |
| Whirlwind | `Q` | 🌀 button |
| Dash (dodges damage) | `Space` or right-click | 💨 button |
| Recall home | `H` | 🏠 button |
| Bag | `B` / `I` / `Tab` | 🎒 |
| Menu | `Esc` | ☰ |
| Zoom | Mouse wheel | — |

Red ground markings show a heavy attack is coming, so dash out of them.

## What's in the world

- **Infinite terrain** streamed in 32 m chunks around you, with 6 biomes: meadow, forest, desert, snow, swamp and volcanic.
- **Difficulty rings**: every ~110 m from the village, monsters get ~2.5 levels stronger and loot improves.
- **Monsters**: slimes, goblins, skeleton archers, charging boars, slamming golems and bat swarms, tinted to their biome. **Elites** come with modifiers (Swift, Shielded, Vampiric, Explosive, Burning). **Landmark bosses** have a purple light beam you can see from far away and show as 💀 on the minimap.
- **Points of interest**: monster camps whose chest unlocks when you clear them, lone chests, buff shrines and boss arenas. Cleared camps, opened chests and defeated bosses stay that way.
- **Loot**: weapons (sword, axe, hammer and dagger each swing differently), armor and trinkets in 5 rarities with random affixes. Your armor colour shows its rarity.
- **Leveling**: every level offers a choice of 3 perks (Twin Bolt, Tempest, Blaze Dash, Leech…), so every run builds differently.
- Day/night cycle and synthesized sound effects (no asset files).

## Project layout

```
src/
  config.ts            world scale + tuning
  world/               terrain noise, biomes, chunk generation, streaming, collision
  entities/            player, enemy AI, enemy definitions
  combat/              stats, perks, damage formulas
  loot/                item generation, rarities, affixes
  game/                main loop, combat system, loot drops, save/load
  render/              stage/lighting, chunk meshes, procedural props & characters, particles
  input/               keyboard/mouse/touch, follow camera
  ui/                  HUD, minimap, bag, perk picker, menus
  audio/               WebAudio sound effects
scripts/sim.ts         headless world-gen checks, loot odds and balance table
```

## Dev

- `npm run sim` checks world generation (determinism, nothing spawning in water or inside the village), prints loot odds by distance, and prints a balance table (hits-to-kill and survivability by level).
- `npm run build` typechecks and builds to `dist/`.
- In dev, `window.game` is exposed in the console.
