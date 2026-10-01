import { pick, range, weightedPick, type RNG } from '../core/rng';

export type Slot = 'weapon' | 'armor' | 'trinket';
export type WeaponType = 'sword' | 'axe' | 'hammer' | 'dagger';
export type StatKey =
  | 'power'
  | 'maxHp'
  | 'armor'
  | 'crit'
  | 'critDmg'
  | 'atkSpeed'
  | 'moveSpeed'
  | 'lifesteal'
  | 'cdr'
  | 'burn'
  | 'regen'
  | 'gold';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  weapon?: WeaponType;
  rarity: number;
  ilvl: number;
  stats: Partial<Record<StatKey, number>>;
}

export const RARITIES = [
  { name: 'Common', color: '#c9ced6' },
  { name: 'Uncommon', color: '#5fd35f' },
  { name: 'Rare', color: '#4aa3ff' },
  { name: 'Epic', color: '#b46bff' },
  { name: 'Legendary', color: '#ff9a1f' },
] as const;

export const WEAPONS: Record<WeaponType, { names: string[]; dmg: number; interval: number; range: number; arc: number; crit: number; knock: number }> = {
  sword: { names: ['Sword', 'Blade', 'Longsword', 'Saber'], dmg: 1, interval: 0.55, range: 2.3, arc: 2.2, crit: 0, knock: 3 },
  axe: { names: ['Axe', 'Hatchet', 'Cleaver', 'Broadaxe'], dmg: 1.35, interval: 0.75, range: 2.4, arc: 2.5, crit: 0, knock: 4 },
  hammer: { names: ['Hammer', 'Maul', 'Warhammer', 'Mace'], dmg: 1.75, interval: 0.95, range: 2.5, arc: 2.8, crit: 0, knock: 7 },
  dagger: { names: ['Dagger', 'Dirk', 'Stiletto', 'Kris'], dmg: 0.68, interval: 0.36, range: 1.9, arc: 1.7, crit: 0.08, knock: 1.5 },
};

const ARMOR_NAMES = ['Tunic', 'Jerkin', 'Chainmail', 'Brigandine', 'Plate', 'Robe'];
const TRINKET_NAMES = ['Ring', 'Amulet', 'Charm', 'Talisman', 'Pendant'];

interface AffixDef {
  prefix: string;
  label: (v: number) => string;
  roll: (ilvl: number) => number;
  /** Rough worth of one point, for comparing items. */
  weight: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const AFFIXES: Record<StatKey, AffixDef> = {
  power: { prefix: 'Brutal', label: (v) => `+${v} Power`, roll: (l) => 2 + l * 0.8, weight: 1 },
  maxHp: { prefix: 'Stalwart', label: (v) => `+${v} Max Health`, roll: (l) => 10 + l * 4, weight: 0.2 },
  armor: { prefix: 'Fortified', label: (v) => `+${v} Armor`, roll: (l) => 3 + l * 1.5, weight: 0.45 },
  crit: { prefix: 'Keen', label: (v) => `+${pct(v)} Crit Chance`, roll: (l) => Math.min(0.08, 0.03 + l * 0.002), weight: 120 },
  critDmg: { prefix: 'Savage', label: (v) => `+${pct(v)} Crit Damage`, roll: (l) => 0.15 + l * 0.01, weight: 30 },
  atkSpeed: { prefix: 'Swift', label: (v) => `+${pct(v)} Attack Speed`, roll: (l) => Math.min(0.15, 0.06 + l * 0.003), weight: 90 },
  moveSpeed: { prefix: 'Fleet', label: (v) => `+${pct(v)} Move Speed`, roll: (l) => Math.min(0.1, 0.04 + l * 0.002), weight: 70 },
  lifesteal: { prefix: 'Vampiric', label: (v) => `+${pct(v)} Life Steal`, roll: (l) => Math.min(0.05, 0.02 + l * 0.001), weight: 200 },
  cdr: { prefix: 'Arcane', label: (v) => `-${pct(v)} Cooldowns`, roll: (l) => Math.min(0.12, 0.05 + l * 0.002), weight: 80 },
  burn: { prefix: 'Blazing', label: (v) => `Burn ${pct(v)} of hits`, roll: (l) => Math.min(0.4, 0.15 + l * 0.01), weight: 40 },
  regen: { prefix: 'Verdant', label: (v) => `+${v.toFixed(1)} Health/sec`, roll: (l) => 0.5 + l * 0.25, weight: 2 },
  gold: { prefix: 'Lucky', label: (v) => `+${pct(v)} Gold Find`, roll: (l) => 0.1 + l * 0.01, weight: 15 },
};

const INTEGER_STATS = new Set<StatKey>(['power', 'maxHp', 'armor']);
const LEGEND_A = ['Dawn', 'Storm', 'Ember', 'Frost', 'Star', 'Void', 'Thunder', 'Moon'];
const LEGEND_B = ['fall', 'breaker', 'song', 'heart', 'bane', 'reaver', 'whisper', 'brand'];

let nextId = 1;
export const newItemId = () => `${Date.now().toString(36)}${(nextId++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function roundStat(key: StatKey, v: number) {
  return INTEGER_STATS.has(key) ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
}

/** Rarity roll; `luck` shifts the odds (elites, chests, distance). */
export function rollRarity(rng: RNG, danger: number, luck = 0): number {
  const d = Math.min(danger, 8);
  const r = weightedPick(rng, [
    [0, Math.max(5, 55 - luck * 30)],
    [1, 28 + luck * 5],
    [2, 12 + d * 1.2 + luck * 10],
    [3, 3.5 + d * 0.7 + luck * 5],
    [4, 0.8 + d * 0.3 + luck * 2],
  ] as const);
  return Math.min(4, r + (luck >= 1 ? 1 : 0));
}

export function generateItem(rng: RNG, ilvl: number, rarity: number, slot?: Slot): Item {
  const s: Slot = slot ?? weightedPick(rng, [
    ['weapon', 4],
    ['armor', 3],
    ['trinket', 2],
  ] as const);
  const stats: Partial<Record<StatKey, number>> = {};
  const quality = 1 + rarity * 0.1;
  let weapon: WeaponType | undefined;
  let base: string;

  if (s === 'weapon') {
    weapon = pick(rng, Object.keys(WEAPONS) as WeaponType[]);
    base = pick(rng, WEAPONS[weapon].names);
    stats.power = roundStat('power', (5 + ilvl * 1.7) * quality * range(rng, 0.9, 1.1));
  } else if (s === 'armor') {
    base = pick(rng, ARMOR_NAMES);
    stats.armor = roundStat('armor', (4 + ilvl * 2.6) * quality * range(rng, 0.9, 1.1));
    stats.maxHp = roundStat('maxHp', (8 + ilvl * 5) * quality * range(rng, 0.9, 1.1));
  } else {
    base = pick(rng, TRINKET_NAMES);
    stats.power = roundStat('power', (2 + ilvl * 0.6) * quality * range(rng, 0.9, 1.1));
  }

  const keys = Object.keys(AFFIXES) as StatKey[];
  const count = Math.min(rarity, 4);
  let lead: StatKey | undefined;
  for (let k = 0; k < count; k++) {
    let key = pick(rng, keys);
    for (let t = 0; t < 6 && k > 0 && key === lead; t++) key = pick(rng, keys);
    lead ??= key;
    const v = AFFIXES[key].roll(ilvl) * range(rng, 0.75, 1.15) * (1 + rarity * 0.08);
    stats[key] = roundStat(key, (stats[key] ?? 0) + v);
  }

  const name =
    rarity >= 4
      ? `${pick(rng, LEGEND_A)}${pick(rng, LEGEND_B)}`
      : lead
        ? `${AFFIXES[lead].prefix} ${base}`
        : rarity === 0 && ilvl <= 2
          ? `Rusty ${base}`
          : base;
  return { id: newItemId(), slot: s, name, weapon, rarity, ilvl, stats };
}

export function statLines(item: Item): string[] {
  return (Object.entries(item.stats) as [StatKey, number][]).map(([k, v]) => AFFIXES[k].label(v));
}

/** Single number for "is this better?" arrows. Weapons also count their swing profile. */
export function itemScore(item: Item | null | undefined): number {
  if (!item) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) s += v * AFFIXES[k].weight;
  if (item.weapon) {
    const w = WEAPONS[item.weapon];
    s += (item.stats.power ?? 0) * ((w.dmg / w.interval) * 0.55 - 1);
  }
  return s;
}

export function salvageValue(item: Item): number {
  return Math.round((5 + item.ilvl * 2) * (1 + item.rarity * item.rarity * 0.6));
}

export function starterWeapon(): Item {
  return { id: newItemId(), slot: 'weapon', name: 'Rusty Sword', weapon: 'sword', rarity: 0, ilvl: 1, stats: { power: 5 } };
}
