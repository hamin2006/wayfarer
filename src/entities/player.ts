import * as THREE from 'three';
import { BAG_SIZE, PLAYER_R } from '../config';
import { computeStats, xpToNext, type BuffKind, type Stats } from '../combat/stats';
import type { PerkId } from '../combat/perks';
import { RARITIES, starterWeapon, type Item, type Slot } from '../loot/items';
import { heroRig, type Rig } from '../render/models';

export const ABILITY_CD = { dash: 2.8, spin: 6, bolt: 2.2 };
export type Ability = keyof typeof ABILITY_CD;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly radius = PLAYER_R;
  readonly rig: Rig = heroRig();
  facing = 0;
  hp = 100;
  level = 1;
  xp = 0;
  gold = 0;
  perks: Partial<Record<PerkId, number>> = {};
  equipped: Record<Slot, Item | null> = { weapon: starterWeapon(), armor: null, trinket: null };
  bag: Item[] = [];
  buffs: { kind: BuffKind; t: number }[] = [];
  stats: Stats = computeStats(1, [], {}, []);

  cd: Record<Ability, number> = { dash: 0, spin: 0, bolt: 0 };
  atkTimer = 0;
  swing = -1;
  swingDur = 0.35;
  hitPending = false;
  dashT = 0;
  readonly dashDir = new THREE.Vector3();
  spinT = -1;
  invuln = 0;
  move = 0;
  burn = { dps: 0, t: 0 };
  readonly knock = new THREE.Vector3();
  recall = -1;
  dead = false;

  constructor() {
    this.rig.root.traverse((o) => (o.castShadow = true));
    this.recompute();
    this.hp = this.stats.maxHp;
  }

  recompute() {
    const ratio = this.stats ? this.hp / this.stats.maxHp : 1;
    this.stats = computeStats(
      this.level,
      Object.values(this.equipped),
      this.perks,
      this.buffs.map((b) => b.kind),
    );
    this.hp = Math.min(this.stats.maxHp, Math.max(1, Math.round(ratio * this.stats.maxHp)));
    const w = this.equipped.weapon;
    this.rig.setWeapon?.(w?.weapon ?? null, w && w.rarity >= 2 ? RARITIES[w.rarity].color : null);
    const armor = this.equipped.armor;
    this.rig.setShirt?.(armor ? ['#8a8f99', '#4f9e4f', '#3f7fd9', '#8b4fd9', '#e08a1f'][armor.rarity] : '#7a8aa0');
  }

  cooldown(a: Ability) {
    return ABILITY_CD[a] * (1 - this.stats.cdr);
  }

  get xpNeeded() {
    return xpToNext(this.level);
  }

  heal(amount: number) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Puts an item on (auto-equip into an empty slot) or in the bag. Returns false if the bag is full. */
  give(item: Item): 'equipped' | 'bag' | 'full' {
    if (!this.equipped[item.slot]) {
      this.equipped[item.slot] = item;
      this.recompute();
      return 'equipped';
    }
    if (this.bag.length >= BAG_SIZE) return 'full';
    this.bag.push(item);
    return 'bag';
  }

  equip(item: Item) {
    const i = this.bag.indexOf(item);
    if (i < 0) return;
    const old = this.equipped[item.slot];
    this.equipped[item.slot] = item;
    if (old) this.bag[i] = old;
    else this.bag.splice(i, 1);
    this.recompute();
  }
}
