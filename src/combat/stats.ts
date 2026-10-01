import { AFFIXES, WEAPONS, type Item, type StatKey, type WeaponType } from '../loot/items';
import { PERKS, type PerkId } from './perks';

export interface Stats {
  maxHp: number;
  power: number;
  armor: number;
  crit: number;
  critDmg: number;
  atkSpeed: number;
  moveSpeed: number;
  lifesteal: number;
  cdr: number;
  burn: number;
  regen: number;
  gold: number;
  // Perk-driven
  damageMult: number;
  spinRadius: number;
  spinMult: number;
  bolts: number;
  pierce: number;
  dashFire: number;
  thorns: number;
  pickup: number;
  // From the equipped weapon
  weapon: WeaponType;
}

export type BuffKind = 'fury' | 'haste' | 'vigor' | 'fortune';
export const BUFFS: Record<BuffKind, { name: string; icon: string; desc: string; duration: number }> = {
  fury: { name: 'Fury', icon: '🔥', desc: '+50% damage', duration: 45 },
  haste: { name: 'Haste', icon: '💨', desc: '+35% move & attack speed', duration: 45 },
  vigor: { name: 'Vigor', icon: '💚', desc: 'Full heal + 5 health/sec', duration: 30 },
  fortune: { name: 'Fortune', icon: '🍀', desc: 'Double gold, better loot', duration: 60 },
};

export const xpToNext = (level: number) => Math.round(30 * Math.pow(level, 1.45));

export function computeStats(level: number, gear: (Item | null)[], perks: Partial<Record<PerkId, number>>, buffs: BuffKind[]): Stats {
  const s: Stats = {
    maxHp: 100 + 14 * (level - 1),
    power: 10 + 2.2 * (level - 1),
    armor: 0,
    crit: 0.05,
    critDmg: 1.5,
    atkSpeed: 1,
    moveSpeed: 6.2,
    lifesteal: 0,
    cdr: 0,
    burn: 0,
    regen: 0.4,
    gold: 0,
    damageMult: 1,
    spinRadius: 3.2,
    spinMult: 1.8,
    bolts: 1,
    pierce: 0,
    dashFire: 0,
    thorns: 0,
    pickup: 1,
    weapon: 'sword',
  };
  let moveBonus = 0;
  for (const item of gear) {
    if (!item) continue;
    if (item.weapon) s.weapon = item.weapon;
    for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) {
      if (!(k in AFFIXES)) continue;
      if (k === 'atkSpeed') s.atkSpeed += v;
      else if (k === 'moveSpeed') moveBonus += v;
      else if (k === 'critDmg') s.critDmg += v;
      else s[k] += v;
    }
  }
  s.crit += WEAPONS[s.weapon].crit;
  for (const [id, stacks] of Object.entries(perks) as [PerkId, number][]) {
    if (stacks) PERKS[id].apply(s, stacks);
  }
  s.moveSpeed *= 1 + moveBonus;

  if (buffs.includes('fury')) s.damageMult *= 1.5;
  if (buffs.includes('haste')) {
    s.moveSpeed *= 1.35;
    s.atkSpeed += 0.35;
  }
  if (buffs.includes('vigor')) s.regen += 5;
  if (buffs.includes('fortune')) s.gold += 1;

  s.cdr = Math.min(s.cdr, 0.6);
  s.lifesteal = Math.min(s.lifesteal, 0.25);
  s.crit = Math.min(s.crit, 0.75);
  s.maxHp = Math.round(s.maxHp);
  return s;
}

/** Armor reduces damage with diminishing returns that scale with the attacker's level. */
export function mitigate(damage: number, armor: number, attackerLevel: number) {
  return damage * (1 - armor / (armor + 40 + 12 * attackerLevel));
}

export function rollDamage(s: Stats, mult: number, rng = Math.random): { amount: number; crit: boolean } {
  const crit = rng() < s.crit;
  const base = s.power * s.damageMult * mult * (0.9 + rng() * 0.2);
  return { amount: Math.max(1, Math.round(crit ? base * s.critDmg : base)), crit };
}
