import * as THREE from 'three';
import { mitigate, rollDamage } from '../combat/stats';
import type { Enemy } from '../entities/enemy';
import { WEAPONS } from '../loot/items';
import type { Ctx } from './ctx';

interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: 'player' | 'enemy';
  dmg: number;
  life: number;
  pierce: number;
  hit: Set<Enemy>;
  src: Enemy | null;
}

interface FirePatch {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  r: number;
  t: number;
  dps: number;
  tick: number;
}

const boltGeo = new THREE.IcosahedronGeometry(0.2, 1);
const boltMat = new THREE.MeshBasicMaterial({ color: '#a8f0ff' });
const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.7);
const arrowMat = new THREE.MeshStandardMaterial({ color: '#e8dcc0', emissive: '#ff5a3c', emissiveIntensity: 0.4 });
const patchGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const patchMat = new THREE.MeshBasicMaterial({ color: '#ff7a1f', transparent: true, opacity: 0.55, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);

/** Player attacks, enemy attacks, projectiles and every damage number. */
export class Combat {
  private projectiles: Projectile[] = [];
  private patches: FirePatch[] = [];
  private delayed: { t: number; fn: () => void }[] = [];
  private v = new THREE.Vector3();

  constructor(private ctx: Ctx) {}

  // ---------- Player abilities ----------

  /** Auto-swing at anything in reach. Called every frame. */
  updatePlayer(dt: number) {
    const { player: p, enemies } = this.ctx;
    const w = WEAPONS[p.stats.weapon];
    p.atkTimer -= dt;

    if (p.swing >= 0) {
      p.swing += dt / p.swingDur;
      if (p.hitPending && p.swing >= 0.45) {
        p.hitPending = false;
        this.resolveSwing();
      }
      if (p.swing >= 1) p.swing = -1;
    }
    if (p.spinT >= 0) {
      p.spinT += dt / 0.35;
      if (p.spinT >= 1) p.spinT = -1;
    }
    if (p.dead || p.atkTimer > 0 || p.swing >= 0 || p.spinT >= 0 || p.dashT > 0) return;

    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) - e.radius;
      if (d < w.range + 0.15 && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (!best) return;
    p.facing = Math.atan2(best.pos.x - p.pos.x, best.pos.z - p.pos.z);
    const interval = w.interval / p.stats.atkSpeed;
    p.atkTimer = interval;
    p.swingDur = Math.min(0.4, interval * 0.85);
    p.swing = 0;
    p.hitPending = true;
    this.ctx.sfx.swing(p.stats.weapon);
  }

  private resolveSwing() {
    const { player: p, enemies } = this.ctx;
    const w = WEAPONS[p.stats.weapon];
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + e.radius) continue;
      let diff = Math.atan2(dx, dz) - p.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > w.arc / 2 && d > e.radius + 0.4) continue;
      const { amount, crit } = rollDamage(p.stats, w.dmg);
      this.hitEnemy(e, amount, crit, this.v.set(dx, 0, dz).normalize(), w.knock);
    }
    // Slash arc sparkle.
    const fx = p.pos.clone().add(new THREE.Vector3(Math.sin(p.facing), 1, Math.cos(p.facing)).multiplyScalar(1.1));
    fx.y = p.pos.y + 1;
    this.ctx.particles.burst(fx, '#ffffff', 4, 3, 0.08, 4, 0.25);
  }

  spin() {
    const { player: p, enemies } = this.ctx;
    p.cd.spin = p.cooldown('spin');
    p.spinT = 0;
    p.swing = -1;
    const r = p.stats.spinRadius;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      if (Math.hypot(dx, dz) > r + e.radius) continue;
      const { amount, crit } = rollDamage(p.stats, p.stats.spinMult);
      this.hitEnemy(e, amount, crit, this.v.set(dx, 0, dz).normalize(), 7);
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const at = new THREE.Vector3(p.pos.x + Math.sin(a) * r * 0.8, p.pos.y + 0.6, p.pos.z + Math.cos(a) * r * 0.8);
      this.ctx.particles.burst(at, '#e8f6ff', 1, 2, 0.12, 2, 0.35);
    }
    this.ctx.sfx.spin();
    this.ctx.shake(0.15);
  }

  bolt(dirX: number, dirZ: number) {
    const p = this.ctx.player;
    p.cd.bolt = p.cooldown('bolt');
    p.facing = Math.atan2(dirX, dirZ);
    const n = p.stats.bolts;
    for (let k = 0; k < n; k++) {
      const a = p.facing + (k - (n - 1) / 2) * 0.16;
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      const pos = p.pos.clone().add(new THREE.Vector3(Math.sin(a) * 0.6, 1.1, Math.cos(a) * 0.6));
      mesh.position.copy(pos);
      this.ctx.scene.add(mesh);
      this.projectiles.push({
        mesh,
        pos,
        vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(22),
        owner: 'player',
        dmg: 1.3,
        life: 0.8,
        pierce: p.stats.pierce,
        hit: new Set(),
        src: null,
      });
    }
    p.swing = 0;
    p.swingDur = 0.25;
    p.hitPending = false;
    this.ctx.sfx.bolt();
  }

  dash(dirX: number, dirZ: number) {
    const p = this.ctx.player;
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.01) p.dashDir.set(Math.sin(p.facing), 0, Math.cos(p.facing));
    else p.dashDir.set(dirX / len, 0, dirZ / len);
    p.facing = Math.atan2(p.dashDir.x, p.dashDir.z);
    p.cd.dash = p.cooldown('dash');
    p.dashT = 0.2;
    p.invuln = Math.max(p.invuln, 0.3);
    p.recall = -1;
    this.ctx.sfx.dash();
    this.ctx.particles.burst(p.pos.clone().setY(p.pos.y + 0.3), '#ffffff', 8, 3, 0.12, 2, 0.4);
  }

  firePatch(at: THREE.Vector3, dps: number) {
    const mesh = new THREE.Mesh(patchGeo, patchMat);
    mesh.position.copy(at).setY(at.y + 0.07);
    mesh.scale.setScalar(1.1);
    this.ctx.scene.add(mesh);
    this.patches.push({ mesh, pos: at.clone(), r: 1.1, t: 2.5, dps, tick: 0 });
  }

  // ---------- Damage ----------

  hitEnemy(e: Enemy, amount: number, crit: boolean, dir: THREE.Vector3 | null, knock: number, fromBurn = false) {
    if (e.dead) return;
    const { ctx } = this;
    const p = ctx.player;
    const dmg = Math.max(1, Math.round(amount * (e.mods.includes('shielded') ? 0.6 : 1)));
    e.hp -= dmg;
    this.aggroGroup(e);
    const top = e.pos.clone().setY(e.pos.y + e.def.height * e.scale * 0.8);
    ctx.text.spawn(top, String(dmg), fromBurn ? 'burn' : crit ? 'crit big' : 'dmg');
    if (!fromBurn) {
      e.flash = 0.09;
      if (dir && knock > 0 && !e.boss) e.vel.addScaledVector(dir, knock / (e.elite ? 2.2 : 1));
      if (p.stats.lifesteal > 0) p.heal(dmg * p.stats.lifesteal);
      if (p.stats.burn > 0) {
        e.burn.dps = Math.max(e.burn.dps, (dmg * p.stats.burn) / 2);
        e.burn.t = 2;
      }
      ctx.particles.burst(top, crit ? '#ffe066' : '#ffffff', crit ? 8 : 4, 4, 0.1, 10, 0.35);
      ctx.sfx.hit(crit);
      if (crit) ctx.hitstop(0.025);
    }
    if (e.hp <= 0) this.kill(e);
  }

  burnTick(e: Enemy, dt: number) {
    e.burn.acc += e.burn.dps * dt;
    if (e.burn.acc >= 1 && (e.burn.acc >= e.burn.dps * 0.5 || e.burn.t <= 0)) {
      const amt = Math.floor(e.burn.acc);
      e.burn.acc -= amt;
      this.hitEnemy(e, amt, false, null, 0, true);
    }
    if (e.burn.t <= 0) e.burn.dps = 0;
  }

  kill(e: Enemy) {
    const { ctx } = this;
    e.die();
    e.cancelTelegraph(ctx);
    const color = `#${e.rig.mats[0].color.getHexString()}`;
    const at = e.pos.clone().setY(e.pos.y + e.def.height * e.scale * 0.4);
    ctx.particles.burst(at, color, e.boss ? 60 : e.elite ? 26 : 14, e.boss ? 9 : 5, 0.16 * e.scale, 12, 0.7);
    ctx.sfx.kill(e.boss);
    ctx.hitstop(e.boss ? 0.3 : 0.04);
    if (e.boss) ctx.shake(0.8);
    if (e.mods.includes('explosive')) {
      const pos = e.pos.clone();
      const tg = ctx.telegraphs.circle(pos, 3.2, 0.8);
      this.delayed.push({
        t: 0.8,
        fn: () => {
          ctx.telegraphs.remove(tg);
          this.shockwave(pos, 3.2, e.dmg * 1.5, e, '#ffb02e');
        },
      });
    }
    ctx.onEnemyKilled(e);
  }

  hurtPlayer(amount: number, from: Enemy, melee: boolean, knock?: THREE.Vector3) {
    const { ctx } = this;
    const p = ctx.player;
    if (p.dead || p.invuln > 0) return;
    const dmg = Math.max(1, Math.round(mitigate(amount, p.stats.armor, from.level)));
    p.hp -= dmg;
    p.invuln = 0.12;
    p.recall = -1;
    ctx.text.spawn(p.pos.clone().setY(p.pos.y + 2), String(dmg), 'hurt');
    ctx.ui.hurtFlash();
    ctx.shake(Math.min(0.5, 0.15 + dmg / p.stats.maxHp));
    ctx.sfx.hurt();
    if (knock) p.knock.add(knock);
    if (melee && p.stats.thorns > 0 && !from.dead) this.hitEnemy(from, dmg * p.stats.thorns, false, null, 0);
    if (from.mods.includes('vampiric') && !from.dead) from.hp = Math.min(from.maxHp, from.hp + dmg * 0.5);
    if (from.mods.includes('burning')) p.burn = { dps: from.dmg * 0.25, t: 3 };
    if (p.hp <= 0) {
      p.hp = 0;
      ctx.onPlayerDeath();
    }
  }

  shockwave(pos: THREE.Vector3, r: number, dmg: number, from: Enemy, color = '#c9b79c') {
    const { ctx } = this;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      ctx.particles.burst(new THREE.Vector3(pos.x + Math.sin(a) * r * 0.9, pos.y + 0.2, pos.z + Math.cos(a) * r * 0.9), color, 1, 3, 0.18, 8, 0.5);
    }
    const p = ctx.player;
    const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (d < 14) ctx.shake(0.35 * (1 - d / 14) + 0.05);
    ctx.sfx.slam();
    if (d < r + p.radius) {
      const away = new THREE.Vector3(p.pos.x - pos.x, 0, p.pos.z - pos.z).normalize().multiplyScalar(6);
      this.hurtPlayer(dmg, from, false, away);
    }
  }

  fireArrow(e: Enemy, spread: number) {
    const p = this.ctx.player;
    const a = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + spread;
    const pos = e.pos.clone().add(new THREE.Vector3(Math.sin(a) * 0.5, 1.2 * e.scale, Math.cos(a) * 0.5));
    const mesh = new THREE.Mesh(arrowGeo, arrowMat);
    mesh.position.copy(pos);
    mesh.quaternion.setFromAxisAngle(UP, a);
    this.ctx.scene.add(mesh);
    this.projectiles.push({
      mesh,
      pos,
      vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(e.boss ? 17 : 14),
      owner: 'enemy',
      dmg: e.dmg,
      life: 1.4,
      pierce: 0,
      hit: new Set(),
      src: e,
    });
    this.ctx.sfx.arrow();
  }

  aggroGroup(e: Enemy) {
    e.alert();
    for (const o of this.ctx.enemies) {
      if (o.dead || o.aggro) continue;
      if ((e.poiId && o.poiId === e.poiId) || o.pos.distanceTo(e.pos) < 6) o.alert();
    }
  }

  // ---------- Per-frame ----------

  update(dt: number) {
    const { ctx } = this;
    const p = ctx.player;

    this.delayed = this.delayed.filter((d) => {
      d.t -= dt;
      if (d.t <= 0) d.fn();
      return d.t > 0;
    });

    this.projectiles = this.projectiles.filter((pr) => {
      pr.life -= dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      let alive = pr.life > 0 && pr.pos.y > ctx.terrain.height(pr.pos.x, pr.pos.z) + 0.1;
      if (alive && pr.owner === 'player') {
        if (Math.random() < 0.6) ctx.particles.burst(pr.pos, '#7fe3ff', 1, 0.6, 0.08, 0, 0.3);
        for (const e of ctx.enemies) {
          if (e.dead || pr.hit.has(e)) continue;
          if (Math.hypot(e.pos.x - pr.pos.x, e.pos.z - pr.pos.z) > e.radius + 0.4) continue;
          pr.hit.add(e);
          const { amount, crit } = rollDamage(p.stats, pr.dmg);
          this.hitEnemy(e, amount, crit, pr.vel.clone().normalize(), 2);
          if (--pr.pierce < 0) {
            alive = false;
            break;
          }
        }
      } else if (alive && pr.src) {
        if (Math.hypot(p.pos.x - pr.pos.x, p.pos.z - pr.pos.z) < p.radius + 0.25 && !p.dead && p.invuln <= 0) {
          this.hurtPlayer(pr.dmg, pr.src, false);
          alive = false;
        }
        for (const o of ctx.obstacles(pr.pos.x, pr.pos.z)) {
          if (Math.hypot(o.x - pr.pos.x, o.z - pr.pos.z) < o.radius) {
            alive = false;
            break;
          }
        }
      }
      if (!alive) pr.mesh.removeFromParent();
      return alive;
    });

    this.patches = this.patches.filter((f) => {
      f.t -= dt;
      f.tick -= dt;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
      f.mesh.scale.setScalar(f.r * (0.9 + Math.sin(f.t * 20) * 0.05) * Math.min(1, f.t * 2));
      if (Math.random() < 0.3) ctx.particles.burst(f.pos.clone().setY(f.pos.y + 0.2), '#ffb340', 1, 1.5, 0.1, -3, 0.4);
      if (f.tick <= 0) {
        f.tick = 0.3;
        for (const e of ctx.enemies) {
          if (!e.dead && Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) < f.r + e.radius) {
            this.hitEnemy(e, f.dps * 0.3, false, null, 0, true);
          }
        }
      }
      if (f.t <= 0) f.mesh.removeFromParent();
      return f.t > 0;
    });
  }

  clear() {
    for (const pr of this.projectiles) pr.mesh.removeFromParent();
    for (const f of this.patches) f.mesh.removeFromParent();
    this.projectiles = [];
    this.patches = [];
    this.delayed = [];
  }
}
