import type { EnemyKind } from '../world/biomes';

export type Behavior = 'melee' | 'ranged' | 'charger' | 'slam' | 'flyer';

export interface EnemyDef {
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  range: number;
  windup: number;
  cooldown: number;
  behavior: Behavior;
  xp: number;
  /** Height of the health bar above the ground. */
  height: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { name: 'Slime', hp: 30, dmg: 8, speed: 3.3, radius: 0.5, range: 1.3, windup: 0.35, cooldown: 1.1, behavior: 'melee', xp: 1, height: 1.2 },
  goblin: { name: 'Goblin', hp: 38, dmg: 10, speed: 4.3, radius: 0.45, range: 1.5, windup: 0.3, cooldown: 1.0, behavior: 'melee', xp: 1.2, height: 1.5 },
  skeleton: { name: 'Skeleton Archer', hp: 30, dmg: 9, speed: 3.4, radius: 0.45, range: 11, windup: 0.55, cooldown: 1.9, behavior: 'ranged', xp: 1.3, height: 2 },
  boar: { name: 'Boar', hp: 55, dmg: 15, speed: 3.8, radius: 0.7, range: 8, windup: 0.7, cooldown: 2.2, behavior: 'charger', xp: 1.6, height: 1.4 },
  golem: { name: 'Golem', hp: 130, dmg: 22, speed: 2.4, radius: 0.9, range: 2.8, windup: 0.9, cooldown: 1.8, behavior: 'slam', xp: 2.6, height: 2.9 },
  bat: { name: 'Bat', hp: 13, dmg: 5, speed: 6, radius: 0.35, range: 1.1, windup: 0.2, cooldown: 0.9, behavior: 'flyer', xp: 0.5, height: 2 },
};

export type EliteMod = 'swift' | 'shielded' | 'vampiric' | 'explosive' | 'burning';
export const ELITE_MODS: Record<EliteMod, { name: string; color: string }> = {
  swift: { name: 'Swift', color: '#7df9ff' },
  shielded: { name: 'Shielded', color: '#7fa8ff' },
  vampiric: { name: 'Vampiric', color: '#ff3b5c' },
  explosive: { name: 'Explosive', color: '#ffb02e' },
  burning: { name: 'Burning', color: '#ff6a1f' },
};

export const BOSS_TITLES: Record<EnemyKind, string> = {
  slime: 'King Slime',
  goblin: 'Goblin Warlord',
  skeleton: 'Bone Marksman',
  boar: 'Great Tusker',
  golem: 'Ancient Colossus',
  bat: 'Night Mother',
};

export function enemyMaxHp(def: EnemyDef, level: number, elite: boolean, boss: boolean) {
  return Math.round(def.hp * (1 + 0.38 * (level - 1)) * (boss ? 9 : elite ? 2.6 : 1));
}

export function enemyDamage(def: EnemyDef, level: number, elite: boolean, boss: boolean) {
  return def.dmg * (1 + 0.22 * (level - 1)) * (boss ? 1.6 : elite ? 1.4 : 1);
}

export function enemyXp(def: EnemyDef, level: number, elite: boolean, boss: boolean) {
  return Math.round(6 * def.xp * (1 + 0.3 * (level - 1)) * (boss ? 25 : elite ? 5 : 1));
}
