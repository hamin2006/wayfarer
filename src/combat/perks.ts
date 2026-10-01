import type { RNG } from '../core/rng';
import type { Stats } from './stats';

export type PerkId =
  | 'might'
  | 'vitality'
  | 'swiftness'
  | 'precision'
  | 'brutality'
  | 'frenzy'
  | 'leech'
  | 'focus'
  | 'twinbolt'
  | 'piercing'
  | 'tempest'
  | 'blazedash'
  | 'thorns'
  | 'regrowth'
  | 'magnet';

export interface Perk {
  name: string;
  icon: string;
  desc: string;
  max: number;
  apply(s: Stats, stacks: number): void;
}

export const PERKS: Record<PerkId, Perk> = {
  might: { name: 'Might', icon: '💪', desc: '+12% damage', max: 5, apply: (s, n) => void (s.damageMult *= 1 + 0.12 * n) },
  vitality: {
    name: 'Vitality',
    icon: '❤️',
    desc: '+25 max health, +10% max health',
    max: 5,
    apply: (s, n) => void (s.maxHp = (s.maxHp + 25 * n) * (1 + 0.1 * n)),
  },
  swiftness: { name: 'Swiftness', icon: '👟', desc: '+8% move speed', max: 3, apply: (s, n) => void (s.moveSpeed *= 1 + 0.08 * n) },
  precision: { name: 'Precision', icon: '🎯', desc: '+6% crit chance', max: 4, apply: (s, n) => void (s.crit += 0.06 * n) },
  brutality: { name: 'Brutality', icon: '💥', desc: '+35% crit damage', max: 3, apply: (s, n) => void (s.critDmg += 0.35 * n) },
  frenzy: { name: 'Frenzy', icon: '⚡', desc: '+12% attack speed', max: 4, apply: (s, n) => void (s.atkSpeed += 0.12 * n) },
  leech: { name: 'Leech', icon: '🩸', desc: '+3% life steal', max: 3, apply: (s, n) => void (s.lifesteal += 0.03 * n) },
  focus: { name: 'Focus', icon: '🧘', desc: '-12% ability cooldowns', max: 3, apply: (s, n) => void (s.cdr += 0.12 * n) },
  twinbolt: { name: 'Twin Bolt', icon: '✨', desc: 'Arcane Bolt fires +1 bolt', max: 2, apply: (s, n) => void (s.bolts += n) },
  piercing: { name: 'Piercing Bolts', icon: '🏹', desc: 'Bolts pass through 2 more enemies', max: 2, apply: (s, n) => void (s.pierce += 2 * n) },
  tempest: {
    name: 'Tempest',
    icon: '🌪️',
    desc: 'Spin: +25% radius, +20% damage',
    max: 3,
    apply: (s, n) => {
      s.spinRadius *= 1 + 0.25 * n;
      s.spinMult *= 1 + 0.2 * n;
    },
  },
  blazedash: { name: 'Blaze Dash', icon: '☄️', desc: 'Dash leaves a burning trail', max: 2, apply: (s, n) => void (s.dashFire += n) },
  thorns: { name: 'Thorns', icon: '🌵', desc: 'Reflect 30% of melee damage taken', max: 3, apply: (s, n) => void (s.thorns += 0.3 * n) },
  regrowth: { name: 'Regrowth', icon: '🌿', desc: '+1.5 health per second', max: 3, apply: (s, n) => void (s.regen += 1.5 * n) },
  magnet: {
    name: 'Magnetism',
    icon: '🧲',
    desc: '+60% pickup radius, +15% gold',
    max: 2,
    apply: (s, n) => {
      s.pickup += 0.6 * n;
      s.gold += 0.15 * n;
    },
  },
};

/** Three distinct perks that aren't maxed out yet. */
export function perkChoices(rng: RNG, owned: Partial<Record<PerkId, number>>): PerkId[] {
  const pool = (Object.keys(PERKS) as PerkId[]).filter((id) => (owned[id] ?? 0) < PERKS[id].max);
  const out: PerkId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
