// Headless checks: world generation sanity, loot distribution, and a balance table.
// Run with `npm run sim`.
import { RING, VILLAGE_R, WATER_Y } from '../src/config';
import { computeStats, mitigate, xpToNext } from '../src/combat/stats';
import type { PerkId } from '../src/combat/perks';
import { mulberry32 } from '../src/core/rng';
import { ENEMIES, enemyDamage, enemyMaxHp, enemyXp } from '../src/entities/enemyDefs';
import { WEAPONS, generateItem, rollRarity, type Item } from '../src/loot/items';
import type { BiomeId, EnemyKind } from '../src/world/biomes';
import { generateChunk } from '../src/world/chunkGen';
import { Terrain } from '../src/world/terrain';

let failures = 0;
const fail = (msg: string) => {
  failures++;
  if (failures < 20) console.log('  FAIL:', msg);
};

// ---------- World generation ----------
console.log('World generation');
const terrain = new Terrain(12345);
const R = 18;
const biomeByRing: Record<number, Partial<Record<BiomeId, number>>> = {};
const poiByRing: Record<number, Record<string, number>> = {};
let water = 0;
let samples = 0;
let chunks = 0;
for (let cx = -R; cx <= R; cx++) {
  for (let cz = -R; cz <= R; cz++) {
    const c = generateChunk(terrain, cx, cz);
    chunks++;
    if ((cx + cz) % 7 === 0 && JSON.stringify(generateChunk(terrain, cx, cz)) !== JSON.stringify(c)) fail(`chunk ${cx},${cz} not deterministic`);
    const ring = Math.floor(terrain.danger(cx * 32, cz * 32));
    const b = terrain.biome(cx * 32, cz * 32);
    biomeByRing[ring] ??= {};
    biomeByRing[ring][b] = (biomeByRing[ring][b] ?? 0) + 1;
    poiByRing[ring] ??= { chunks: 0 };
    poiByRing[ring].chunks++;
    for (const poi of c.pois) {
      poiByRing[ring][poi.type] = (poiByRing[ring][poi.type] ?? 0) + 1;
      if (!terrain.walkable(poi.x, poi.z)) fail(`${poi.id} in water`);
      if (Math.hypot(poi.x, poi.z) < VILLAGE_R * 1.3) fail(`${poi.id} inside the village`);
      for (const s of poi.spawns) if (!terrain.walkable(s.x, s.z) && poi.type !== 'boss') fail(`${poi.id} spawn in water`);
    }
    for (const w of c.wanderers) if (Math.hypot(w.x, w.z) < VILLAGE_R * 1.3) fail(`wanderer in village at ${cx},${cz}`);
    for (const p of c.props) {
      if (p.kind !== 'reed' && p.y < WATER_Y + 0.4) fail(`${p.kind} in water at ${cx},${cz}`);
      if (p.radius > 0 && Math.hypot(p.x, p.z) < 3) fail(`solid prop blocks the spawn point`);
    }
    for (let k = 0; k < 4; k++) {
      samples++;
      if (!terrain.walkable(cx * 32 + k * 8, cz * 32)) water++;
    }
  }
}
console.log(`  ${chunks} chunks, ${((water / samples) * 100).toFixed(0)}% water`);
for (const ring of Object.keys(poiByRing).map(Number).sort((a, b) => a - b)) {
  const p = poiByRing[ring];
  const b = Object.entries(biomeByRing[ring]).map(([k, v]) => `${k} ${Math.round((v / p.chunks) * 100)}%`).join(', ');
  console.log(`  ring ${ring} (${p.chunks} chunks): camps ${p.camp ?? 0}, bosses ${p.boss ?? 0}, chests ${p.chest ?? 0}, shrines ${p.shrine ?? 0} | ${b}`);
}
if (!terrain.walkable(0, 0)) fail('spawn point is not walkable');

// ---------- Loot ----------
console.log('Loot rarity by distance (normal drop / elite drop)');
const rng = mulberry32(7);
for (const danger of [0.5, 2, 4, 8]) {
  const counts = [0, 0, 0, 0, 0];
  const elite = [0, 0, 0, 0, 0];
  for (let k = 0; k < 20000; k++) {
    counts[rollRarity(rng, danger)]++;
    elite[rollRarity(rng, danger, 1)]++;
  }
  const pct = (a: number[]) => a.map((c) => `${((c / 20000) * 100).toFixed(1)}%`).join(' / ');
  console.log(`  ring ${danger}: ${pct(counts)}   elite: ${pct(elite)}`);
}
for (let k = 0; k < 4; k++) {
  const it = generateItem(rng, 12, k + 1);
  console.log(`  e.g. ${['', 'Uncommon', 'Rare', 'Epic', 'Legendary'][k + 1]} ilvl 12: ${it.name} ${JSON.stringify(it.stats)}`);
}

// ---------- Balance ----------
console.log('Balance (hero with level-appropriate uncommon gear, perks taken at each level)');
const gear = (L: number): Item[] => [
  { id: 'w', slot: 'weapon', name: '', weapon: 'sword', rarity: 1, ilvl: L, stats: { power: Math.round((5 + L * 1.7) * 1.1) } },
  { id: 'a', slot: 'armor', name: '', rarity: 1, ilvl: L, stats: { armor: Math.round((4 + L * 2.6) * 1.1), maxHp: Math.round((8 + L * 5) * 1.1) } },
];
const perksAt = (L: number): Partial<Record<PerkId, number>> => {
  const n = L - 1;
  return { might: Math.min(5, Math.ceil(n / 3)), vitality: Math.min(5, Math.floor(n / 3)), frenzy: Math.min(4, Math.floor(n / 4)) };
};
const kinds: EnemyKind[] = ['slime', 'goblin', 'skeleton', 'boar', 'golem', 'bat'];
console.log('  L  | ' + kinds.map((k) => k.padEnd(9)).join(' ') + '| kills/lvl | hero dies to (goblin hits)');
for (const L of [1, 3, 5, 8, 12, 16, 20, 30]) {
  const s = computeStats(L, gear(L), perksAt(L), []);
  const w = WEAPONS[s.weapon];
  const hit = s.power * s.damageMult * w.dmg * (1 + s.crit * (s.critDmg - 1));
  const cells = kinds.map((k) => {
    const hp = enemyMaxHp(ENEMIES[k], L, false, false);
    return `${(hp / hit).toFixed(1)} hits`.padEnd(9);
  });
  const xp = enemyXp(ENEMIES.goblin, L, false, false);
  const goblinHit = mitigate(enemyDamage(ENEMIES.goblin, L, false, false), s.armor, L);
  const goblinHitHarder = mitigate(enemyDamage(ENEMIES.goblin, L + 4, false, false), s.armor, L + 4);
  console.log(
    `  ${String(L).padStart(2)} | ${cells.join(' ')}| ${String(Math.ceil(xpToNext(L) / xp)).padStart(9)} | ${(s.maxHp / goblinHit).toFixed(1)} (same lv), ${(s.maxHp / goblinHitHarder).toFixed(1)} (+4 lv)`,
  );
  const bossHp = enemyMaxHp(ENEMIES.golem, L + 2, true, true);
  const ttk = bossHp / ((hit * s.atkSpeed) / w.interval);
  if (ttk > 90) fail(`boss at L${L} takes ${ttk.toFixed(0)}s of pure auto-attacks`);
  for (const k of kinds) {
    const hits = enemyMaxHp(ENEMIES[k], L, false, false) / hit;
    if (k !== 'golem' && hits > 6) fail(`${k} at L${L} needs ${hits.toFixed(1)} hits`);
  }
}
console.log('  ring → typical foe level:', [0, 1, 2, 3, 4, 6, 8].map((r) => `${r}:${terrain.enemyLevel(r * RING + 5, 7)}`).join('  '));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
