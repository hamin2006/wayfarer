import { CHUNK, VILLAGE_R, WATER_Y } from '../config';
import { hashSeed, mulberry32, pick, randInt, range, weightedPick, type RNG } from '../core/rng';
import { BIOMES, type EnemyKind, type PropKind } from './biomes';
import type { Terrain } from './terrain';

export interface PropInst {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  /** Collision radius; 0 means the player walks through it. */
  radius: number;
}

export interface SpawnDef {
  kind: EnemyKind;
  x: number;
  z: number;
  level: number;
  elite: boolean;
  boss?: boolean;
}

export type ShrineKind = 'fury' | 'haste' | 'vigor' | 'fortune';
export type PoiType = 'camp' | 'chest' | 'shrine' | 'boss';

export interface Poi {
  id: string;
  type: PoiType;
  x: number;
  z: number;
  level: number;
  spawns: SpawnDef[];
  shrine?: ShrineKind;
}

export interface ChunkData {
  cx: number;
  cz: number;
  key: string;
  props: PropInst[];
  pois: Poi[];
  wanderers: SpawnDef[];
}

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const chunkOf = (v: number) => Math.floor(v / CHUNK + 0.5);

const BASE_RADIUS: Partial<Record<PropKind, number>> = {
  oak: 0.55,
  pine: 0.45,
  snowpine: 0.45,
  rock: 0.55,
  boulder: 1.1,
  cactus: 0.35,
  deadtree: 0.35,
  crystal: 0.45,
  house: 2.7,
  well: 0.9,
  lamp: 0.2,
};

// Hand-placed village around the origin. The player spawns at the centre.
const VILLAGE: [PropKind, number, number][] = [
  ['house', -12, -5],
  ['house', 11, -9],
  ['house', -9, 11],
  ['house', 13, 7],
  ['house', 1, -15],
  ['well', 4.5, 3.5],
  ['lamp', -5, -5],
  ['lamp', 6, -5],
  ['lamp', -5, 6],
  ['lamp', 7, 6],
];

function spawnKinds(rng: RNG, weights: [EnemyKind, number][], count: number): EnemyKind[] {
  const kinds: EnemyKind[] = [];
  while (kinds.length < count) {
    const k = weightedPick(rng, weights);
    // Bats come in flocks.
    if (k === 'bat') kinds.push('bat', 'bat');
    kinds.push(k);
  }
  return kinds;
}

/** `poisOnly` skips props (used to scan far-away chunks for the minimap). */
export function generateChunk(terrain: Terrain, cx: number, cz: number, poisOnly = false): ChunkData {
  const rng = mulberry32(hashSeed(terrain.seed, 'chunk', cx, cz));
  const x0 = cx * CHUNK - CHUNK / 2;
  const z0 = cz * CHUNK - CHUNK / 2;
  const centerX = cx * CHUNK;
  const centerZ = cz * CHUNK;
  const danger = terrain.danger(centerX, centerZ);
  const key = chunkKey(cx, cz);
  const pois: Poi[] = [];
  const props: PropInst[] = [];
  const wanderers: SpawnDef[] = [];
  const inVillage = (x: number, z: number, pad = 0) => Math.hypot(x, z) < VILLAGE_R * 1.3 + pad;

  const dry = (x: number, z: number, r: number) =>
    [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ].every(([dx, dz]) => terrain.height(x + dx, z + dz) > WATER_Y + 0.4);

  const findSpot = (margin: number, clear: number) => {
    for (let t = 0; t < 10; t++) {
      const x = x0 + range(rng, margin, CHUNK - margin);
      const z = z0 + range(rng, margin, CHUNK - margin);
      if (!inVillage(x, z, 10) && dry(x, z, clear) && !pois.some((p) => Math.hypot(p.x - x, p.z - z) < 10)) return { x, z };
    }
    return null;
  };

  const spawnAround = (x: number, z: number, kinds: EnemyKind[], r0: number, r1: number, eliteChance: number) =>
    kinds.map((kind, k) => {
      const a = (k / kinds.length) * Math.PI * 2 + range(rng, -0.4, 0.4);
      let r = range(rng, r0, r1);
      // Pull spawns inward until they're on dry land (the centre always is).
      while (r > 0.5 && !terrain.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) r *= 0.6;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      return { kind, x: sx, z: sz, level: terrain.enemyLevel(sx, sz), elite: rng() < eliteChance };
    });

  // ---- Points of interest ----
  const biome = BIOMES[terrain.biome(centerX, centerZ)];
  if (!inVillage(centerX, centerZ, 8)) {
    const roll = rng();
    if (danger >= 1.6 && roll < 0.04) {
      const spot = findSpot(9, 6);
      if (spot) {
        const level = terrain.enemyLevel(spot.x, spot.z) + 2;
        const kinds = biome.enemies.map(([k]) => k).filter((k) => k !== 'bat');
        const boss: SpawnDef = { kind: pick(rng, kinds), x: spot.x, z: spot.z, level, elite: true, boss: true };
        const adds = spawnAround(spot.x, spot.z, spawnKinds(rng, biome.enemies, 2), 4, 6, 0);
        pois.push({ id: `${key}:boss`, type: 'boss', ...spot, level, spawns: [boss, ...adds] });
      }
    } else if (danger >= 0.6 && roll < 0.5) {
      const spot = findSpot(7, 5);
      if (spot) {
        const count = Math.min(7, 3 + Math.floor(Math.min(danger, 6) * 0.6) + randInt(rng, 0, 1));
        const elite = Math.min(0.4, 0.12 + danger * 0.03);
        const spawns = spawnAround(spot.x, spot.z, spawnKinds(rng, biome.enemies, count), 2, 5, 0);
        if (rng() < elite * 2.5) spawns[0].elite = true;
        pois.push({ id: `${key}:camp`, type: 'camp', ...spot, level: terrain.enemyLevel(spot.x, spot.z), spawns });
      }
    }
    if (rng() < 0.08) {
      const spot = findSpot(4, 1.5);
      if (spot) pois.push({ id: `${key}:chest`, type: 'chest', ...spot, level: terrain.enemyLevel(spot.x, spot.z), spawns: [] });
    }
    if (rng() < 0.06) {
      const spot = findSpot(4, 2);
      const shrine = pick(rng, ['fury', 'haste', 'vigor', 'fortune'] as const);
      if (spot) pois.push({ id: `${key}:shrine`, type: 'shrine', ...spot, level: 1, spawns: [], shrine });
    }
    if (danger >= 0.6) {
      const n = rng() < 0.55 ? 1 : rng() < 0.5 ? 2 : 0;
      for (let k = 0; k < n; k++) {
        const x = x0 + range(rng, 2, CHUNK - 2);
        const z = z0 + range(rng, 2, CHUNK - 2);
        if (!dry(x, z, 1) || inVillage(x, z, 6)) continue;
        const b = BIOMES[terrain.biome(x, z)];
        for (const kind of spawnKinds(rng, b.enemies, 1)) {
          wanderers.push({ kind, x: x + range(rng, -1.5, 1.5), z: z + range(rng, -1.5, 1.5), level: terrain.enemyLevel(x, z), elite: false });
        }
      }
    }
  }

  if (poisOnly) return { cx, cz, key, props, pois, wanderers };

  // ---- Props on a jittered 4 m grid ----
  const cell = 4;
  for (let gx = 0; gx < CHUNK / cell; gx++) {
    for (let gz = 0; gz < CHUNK / cell; gz++) {
      const x = x0 + gx * cell + range(rng, 0.3, cell - 0.3);
      const z = z0 + gz * cell + range(rng, 0.3, cell - 0.3);
      const b = BIOMES[terrain.biome(x, z)];
      const roll = rng();
      const kind = weightedPick(rng, b.props);
      const scale = range(rng, 0.8, 1.3);
      const rot = rng() * Math.PI * 2;
      if (roll > b.density) continue;
      if (inVillage(x, z)) continue;
      if (pois.some((p) => Math.hypot(p.x - x, p.z - z) < (p.type === 'camp' || p.type === 'boss' ? 7 : 3))) continue;
      const y = terrain.height(x, z);
      const wet = y < WATER_Y + 0.4;
      if (kind === 'reed' ? y < WATER_Y - 0.3 : wet) continue;
      props.push({ kind, x, y, z, scale, rot, radius: (BASE_RADIUS[kind] ?? 0) * scale });
    }
  }

  // ---- Village ----
  for (const [kind, x, z] of VILLAGE) {
    if (chunkOf(x) !== cx || chunkOf(z) !== cz) continue;
    props.push({ kind, x, y: terrain.height(x, z), z, scale: 1, rot: Math.atan2(-x, -z), radius: BASE_RADIUS[kind] ?? 0 });
  }

  return { cx, cz, key, props, pois, wanderers };
}
