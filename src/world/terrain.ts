import { Color } from 'three';
import { RING, VILLAGE_R, WATER_Y } from '../config';
import { Noise } from '../core/noise';
import { hashSeed } from '../core/rng';
import { BIOMES, type BiomeId } from './biomes';

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const SHORE = new Color('#e3cf92');
const tmp = new Color();

/** Pure functions of world position: height, biome, danger. Everything derives from the world seed. */
export class Terrain {
  private hN: Noise;
  private dN: Noise;
  private tN: Noise;
  private mN: Noise;
  private vN: Noise;
  private cN: Noise;

  constructor(readonly seed: number) {
    this.hN = new Noise(hashSeed(seed, 'h'));
    this.dN = new Noise(hashSeed(seed, 'd'));
    this.tN = new Noise(hashSeed(seed, 't'));
    this.mN = new Noise(hashSeed(seed, 'm'));
    this.vN = new Noise(hashSeed(seed, 'v'));
    this.cN = new Noise(hashSeed(seed, 'c'));
  }

  height(x: number, z: number): number {
    let h = this.hN.fbm(x / 110, z / 110, 4) * 6 + 0.8 + this.dN.fbm(x / 22, z / 22, 2) * 0.7;
    // The village sits on a flat, dry plateau.
    const flat = smoothstep(VILLAGE_R * 1.9, VILLAGE_R, Math.hypot(x, z));
    return h + (0.6 - h) * flat;
  }

  /** Distance from the village in rings (fractional). */
  danger(x: number, z: number) {
    return Math.hypot(x, z) / RING;
  }

  enemyLevel(x: number, z: number) {
    const d = this.danger(x, z);
    return Math.max(1, Math.round(1 + d * 2.4 + this.cN.at(x / 60, z / 60) * 0.7));
  }

  biome(x: number, z: number): BiomeId {
    const t = this.tN.fbm(x / 520, z / 520, 3);
    const m = this.mN.fbm(x / 430, z / 430, 3);
    const d = this.danger(x, z);
    if (d < 0.9) return t > 0.05 && m > 0 ? 'forest' : 'meadow';
    if (d > 2.5 && this.vN.fbm(x / 300, z / 300, 2) > 0.22) return 'volcanic';
    if (t < -0.22) return 'snow';
    if (t > 0.25) return m < 0.05 ? 'desert' : 'swamp';
    return m > 0.05 ? 'forest' : 'meadow';
  }

  walkable(x: number, z: number) {
    return this.height(x, z) > WATER_Y + 0.2;
  }

  groundColor(x: number, z: number, h: number, out: Color): Color {
    const b = BIOMES[this.biome(x, z)];
    const v = this.cN.at(x / 9, z / 9) * 0.5 + 0.5;
    out.set(b.ground[0]).lerp(tmp.set(b.ground[1]), v);
    const shore = smoothstep(WATER_Y + 0.9, WATER_Y + 0.1, h);
    if (shore > 0) out.lerp(SHORE, shore);
    return out;
  }

  regionName(x: number, z: number): string {
    if (Math.hypot(x, z) < VILLAGE_R * 1.4) return 'Hearthvale Village';
    const b = BIOMES[this.biome(x, z)];
    const h = hashSeed(this.seed, Math.floor(x / 170), Math.floor(z / 170));
    return `${b.adjectives[h % b.adjectives.length]} ${b.nouns[(h >>> 8) % b.nouns.length]}`;
  }
}
