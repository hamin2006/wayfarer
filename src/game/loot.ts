import * as THREE from 'three';
import { PICKUP_R } from '../config';
import type { Enemy } from '../entities/enemy';
import { RARITIES, generateItem, rollRarity, type Item } from '../loot/items';
import type { Ctx } from './ctx';

type DropKind = 'item' | 'gold' | 'orb';

interface Drop {
  kind: DropKind;
  item?: Item;
  amount: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  group: THREE.Group;
  t: number;
  landed: boolean;
  magnet: boolean;
  blocked: boolean;
}

const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10).rotateX(Math.PI / 2);
const orbGeo = new THREE.IcosahedronGeometry(0.2, 1);
const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 6, 1, true).translate(0, 3, 0);
const coinMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.6, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.4 });
const orbMat = new THREE.MeshStandardMaterial({ color: '#ff3b5c', emissive: '#ff1f45', emissiveIntensity: 1 });
const gemMats = RARITIES.map((r) => new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.6, flatShading: true }));
const beamMats = RARITIES.map(
  (r) => new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
);

export class Loot {
  private drops: Drop[] = [];
  private bagFullWarned = 0;

  constructor(private ctx: Ctx) {}

  private spawn(kind: DropKind, at: THREE.Vector3, amount: number, item?: Item) {
    const group = new THREE.Group();
    if (kind === 'item' && item) {
      const gem = new THREE.Mesh(gemGeo, gemMats[item.rarity]);
      gem.castShadow = true;
      group.add(gem);
      if (item.rarity >= 2) group.add(new THREE.Mesh(beamGeo, beamMats[item.rarity]));
    } else if (kind === 'gold') {
      group.add(new THREE.Mesh(coinGeo, coinMat));
    } else {
      group.add(new THREE.Mesh(orbGeo, orbMat));
    }
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 2.5;
    const pos = at.clone().setY(at.y + 0.8);
    group.position.copy(pos);
    this.ctx.scene.add(group);
    this.drops.push({ kind, item, amount, pos, vel: new THREE.Vector3(Math.cos(a) * s, 6, Math.sin(a) * s), group, t: 0, landed: false, magnet: false, blocked: false });
  }

  spawnItem(at: THREE.Vector3, ilvl: number, rarity: number) {
    const item = generateItem(Math.random, ilvl, rarity);
    this.spawn('item', at, 0, item);
    if (rarity >= 3) this.ctx.sfx.rareDrop(rarity);
  }

  spawnGold(at: THREE.Vector3, amount: number) {
    const n = Math.min(5, Math.max(1, Math.round(amount / 8)));
    for (let k = 0; k < n; k++) this.spawn('gold', at, Math.max(1, Math.round(amount / n)));
  }

  fromEnemy(e: Enemy) {
    const p = this.ctx.player;
    const danger = this.ctx.terrain.danger(e.pos.x, e.pos.z);
    const fortune = p.buffs.some((b) => b.kind === 'fortune');
    const at = e.pos;
    if (Math.random() < 0.55 || e.elite) {
      const gold = (2 + e.level * 1.2) * (0.6 + Math.random() * 0.8) * (e.boss ? 12 : e.elite ? 4 : 1) * (1 + p.stats.gold);
      this.spawnGold(at, Math.round(gold));
    }
    if (Math.random() < (e.boss ? 0.8 : 0.12)) this.spawn('orb', at, 0);
    const luck = (fortune ? 0.5 : 0) + (e.boss ? 1.5 : e.elite ? 1 : 0);
    const items = e.boss ? 3 : e.elite ? 1 + (Math.random() < 0.3 ? 1 : 0) : Math.random() < (fortune ? 0.24 : 0.14) ? 1 : 0;
    for (let k = 0; k < items; k++) this.spawnItem(at, e.level, Math.max(e.boss ? 2 : 0, rollRarity(Math.random, danger, luck)));
  }

  fromChest(at: THREE.Vector3, level: number, bonus: number) {
    const danger = this.ctx.terrain.danger(at.x, at.z);
    const p = this.ctx.player;
    this.spawnGold(at, Math.round((10 + level * 4) * (1 + bonus) * (1 + p.stats.gold)));
    const n = 1 + (Math.random() < 0.5 + bonus * 0.3 ? 1 : 0);
    for (let k = 0; k < n; k++) this.spawnItem(at, level, rollRarity(Math.random, danger, 0.5 + bonus));
  }

  update(dt: number, t: number) {
    const { player: p, terrain } = this.ctx;
    const pickR = PICKUP_R * p.stats.pickup;
    this.drops = this.drops.filter((d) => {
      d.t += dt;
      const ground = terrain.height(d.pos.x, d.pos.z) + 0.35;
      const dist = Math.hypot(p.pos.x - d.pos.x, p.pos.z - d.pos.z);
      if (!d.magnet && !d.blocked && d.t > 0.5 && !p.dead && dist < pickR) d.magnet = true;
      if (d.blocked && dist > pickR + 1) d.blocked = false;

      if (d.magnet) {
        const target = p.pos.clone().setY(p.pos.y + 1);
        const to = target.sub(d.pos);
        const len = to.length();
        if (len < 0.5) return !this.collect(d);
        d.pos.addScaledVector(to.normalize(), Math.min(len, (8 + d.t * 6) * dt));
      } else if (!d.landed) {
        d.vel.y -= 20 * dt;
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y <= ground && d.vel.y < 0) {
          d.pos.y = ground;
          d.landed = true;
        }
      } else {
        d.pos.y = ground + Math.sin(t * 3 + d.t) * 0.08;
      }
      d.group.position.copy(d.pos);
      d.group.children[0].rotation.y = t * 2.5 + d.t;
      // Unclaimed drops vanish eventually so the world doesn't fill up.
      if (d.t > 180) {
        d.group.removeFromParent();
        return false;
      }
      return true;
    });
  }

  /** Returns true if the drop was taken. */
  private collect(d: Drop): boolean {
    const { player: p, sfx, ui, text } = this.ctx;
    if (d.kind === 'gold') {
      p.gold += d.amount;
      sfx.coin();
      text.spawn(p.pos.clone().setY(p.pos.y + 1.8), `+${d.amount}g`, 'gold', 0.6);
    } else if (d.kind === 'orb') {
      const healed = p.heal(p.stats.maxHp * 0.2);
      sfx.orb();
      if (healed > 0) text.spawn(p.pos.clone().setY(p.pos.y + 1.8), `+${Math.round(healed)}`, 'heal', 0.7);
    } else if (d.item) {
      const res = p.give(d.item);
      if (res === 'full') {
        d.magnet = false;
        d.blocked = true;
        if (performance.now() - this.bagFullWarned > 4000) {
          this.bagFullWarned = performance.now();
          ui.toast('Bag full — open your bag (B) to salvage junk', 'warn');
        }
        return false;
      }
      sfx.pickup(d.item.rarity);
      ui.itemToast(d.item, res === 'equipped');
      ui.refreshBag();
    }
    d.group.removeFromParent();
    return true;
  }

  clear() {
    for (const d of this.drops) d.group.removeFromParent();
    this.drops = [];
  }
}
