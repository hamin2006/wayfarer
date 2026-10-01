import * as THREE from 'three';
import { AGGRO_R, LEASH_R } from '../config';
import type { Telegraph } from '../render/fx';
import { enemyRig, type Rig } from '../render/models';
import { BIOMES, type EnemyKind } from '../world/biomes';
import { moveCircle } from '../world/collide';
import type { SpawnDef } from '../world/chunkGen';
import type { Ctx } from '../game/ctx';
import {
  BOSS_TITLES,
  ELITE_MODS,
  ENEMIES,
  enemyDamage,
  enemyMaxHp,
  type EliteMod,
  type EnemyDef,
} from './enemyDefs';

type State = 'idle' | 'chase' | 'windup' | 'charge' | 'recover' | 'return' | 'dying';

const barGeo = new THREE.PlaneGeometry(1, 0.11).translate(0.5, 0, 0);
const barBg = new THREE.MeshBasicMaterial({ color: '#1d1f2b', transparent: true, opacity: 0.7, depthTest: false });
const barFill = new THREE.MeshBasicMaterial({ color: '#ff4d5e', depthTest: false });
const barFillElite = new THREE.MeshBasicMaterial({ color: '#ffb02e', depthTest: false });
const auraGeo = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);
const MODS = Object.keys(ELITE_MODS) as EliteMod[];

let nextId = 1;

export class Enemy {
  readonly id = nextId++;
  readonly def: EnemyDef;
  readonly group = new THREE.Group();
  readonly rig: Rig;
  readonly pos = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly mods: EliteMod[] = [];
  readonly name: string;
  readonly radius: number;
  readonly scale: number;
  maxHp: number;
  hp: number;
  dmg: number;
  speed: number;
  facing = Math.random() * Math.PI * 2;
  state: State = 'idle';
  stateT = 0;
  cd = 0;
  novaCd = 6;
  aggro = false;
  dead = false;
  flash = 0;
  burn = { dps: 0, t: 0, acc: 0 };
  attackAnim = -1;
  private wander = new THREE.Vector3();
  private wanderT = 0;
  private chargeDir = new THREE.Vector3();
  private chargeHit = false;
  private telegraph: Telegraph | null = null;
  private bar = new THREE.Group();
  private fill: THREE.Mesh;
  private moving = 0;
  private auraMat: THREE.Material | null = null;

  constructor(
    readonly kind: EnemyKind,
    spawn: SpawnDef,
    readonly chunkKey: string,
    readonly poiId: string | null,
    biomeTint: string,
  ) {
    this.def = ENEMIES[kind];
    this.rig = enemyRig(kind, biomeTint);
    this.level = spawn.level;
    this.elite = spawn.elite;
    this.boss = !!spawn.boss;
    if (this.elite) {
      const n = this.boss ? 2 : 1;
      const pool = [...MODS];
      for (let k = 0; k < n; k++) this.mods.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    this.scale = this.boss ? (kind === 'golem' ? 1.6 : 2.2) : this.elite ? 1.3 : 1;
    this.radius = this.def.radius * this.scale;
    this.maxHp = this.hp = enemyMaxHp(this.def, this.level, this.elite, this.boss);
    this.dmg = enemyDamage(this.def, this.level, this.elite, this.boss);
    this.speed = this.def.speed * (this.mods.includes('swift') ? 1.4 : 1) * (this.boss ? 0.9 : 1);
    this.name = this.boss
      ? BOSS_TITLES[kind]
      : this.elite
        ? `${ELITE_MODS[this.mods[0]].name} ${this.def.name}`
        : this.def.name;

    // Remember authored glow (eyes etc.) so hit flashes can restore it.
    for (const m of this.rig.mats) {
      m.userData.emissive = m.emissive.getHex();
      m.userData.ei = m.emissiveIntensity;
    }
    this.rig.root.scale.setScalar(this.scale);
    this.group.add(this.rig.root);
    if (this.elite) {
      this.auraMat = new THREE.MeshBasicMaterial({ color: ELITE_MODS[this.mods[0]].color, transparent: true, opacity: 0.8, depthWrite: false });
      const aura = new THREE.Mesh(auraGeo, this.auraMat);
      aura.scale.setScalar(this.radius * 1.6);
      aura.position.y = 0.05;
      this.group.add(aura);
    }
    const bg = new THREE.Mesh(barGeo, barBg);
    this.fill = new THREE.Mesh(barGeo, this.elite ? barFillElite : barFill);
    const w = this.boss ? 0 : this.elite ? 1.6 : 1;
    bg.scale.x = w;
    bg.position.x = -w / 2;
    this.fill.position.set(-w / 2, 0, 0.001);
    this.fill.scale.x = w;
    this.bar.add(bg, this.fill);
    this.bar.position.y = this.def.height * this.scale + 0.35;
    this.bar.visible = false;
    this.bar.renderOrder = 5;
    bg.renderOrder = 5;
    this.fill.renderOrder = 6;
    this.group.add(this.bar);

    this.pos.set(spawn.x, 0, spawn.z);
    this.home.copy(this.pos);
    this.wander.copy(this.pos);
  }

  readonly level: number;
  readonly elite: boolean;
  readonly boss: boolean;

  get aggroRange() {
    return this.boss ? 15 : this.elite ? AGGRO_R + 2 : AGGRO_R;
  }

  static create(spawn: SpawnDef, chunkKey: string, poiId: string | null, ctx: Ctx) {
    const tint = BIOMES[ctx.terrain.biome(spawn.x, spawn.z)].tint;
    const e = new Enemy(spawn.kind, spawn, chunkKey, poiId, tint);
    e.pos.y = ctx.terrain.height(e.pos.x, e.pos.z);
    e.group.position.copy(e.pos);
    ctx.scene.add(e.group);
    return e;
  }

  die() {
    this.dead = true;
    this.setState('dying');
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  alert() {
    if (this.dead || this.aggro) return;
    this.aggro = true;
    if (this.state === 'idle' || this.state === 'return') this.setState('chase');
  }

  cancelTelegraph(ctx: Ctx) {
    if (this.telegraph) ctx.telegraphs.remove(this.telegraph);
    this.telegraph = null;
  }

  private stepToward(ctx: Ctx, tx: number, tz: number, speed: number, dt: number, keep = 0) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05 + keep) return d;
    const step = Math.min(d - keep, speed * dt);
    this.face(dx, dz, dt);
    moveCircle(this.pos, (dx / d) * step, (dz / d) * step, this.radius, ctx.terrain, ctx.obstacles(this.pos.x, this.pos.z));
    this.moving = 1;
    return d;
  }

  private face(dx: number, dz: number, dt: number, rate = 10) {
    const target = Math.atan2(dx, dz);
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * rate);
  }

  update(dt: number, t: number, ctx: Ctx) {
    this.stateT += dt;
    this.cd -= dt;
    this.novaCd -= dt;
    this.moving = 0;
    const p = ctx.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const def = this.def;
    const swift = this.mods.includes('swift');
    const windup = def.windup * (swift ? 0.75 : 1) * (this.boss ? 1.15 : 1);

    if (this.state === 'dying') {
      const k = Math.min(1, this.stateT / 0.25);
      this.rig.root.scale.setScalar(this.scale * (1 + k * 0.3) * (1 - k));
      this.group.position.copy(this.pos);
      return;
    }

    // Knockback.
    if (this.vel.lengthSq() > 0.01) {
      moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius, ctx.terrain, ctx.obstacles(this.pos.x, this.pos.z));
      this.vel.multiplyScalar(Math.exp(-9 * dt));
    }

    if (this.burn.t > 0) {
      this.burn.t -= dt;
      ctx.combat.burnTick(this, dt);
      if (this.dead) return;
    }

    const playerAlive = !p.dead;
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          this.wander.set(this.home.x + Math.cos(a) * 2.5, 0, this.home.z + Math.sin(a) * 2.5);
        }
        this.stepToward(ctx, this.wander.x, this.wander.z, this.speed * 0.3, dt);
        if (playerAlive && dist < this.aggroRange) ctx.combat.aggroGroup(this);
        break;
      }
      case 'return': {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4 * dt);
        if (this.stepToward(ctx, this.home.x, this.home.z, this.speed * 1.3, dt) < 1) {
          this.hp = this.maxHp;
          this.aggro = false;
          this.setState('idle');
        }
        break;
      }
      case 'chase': {
        if (!playerAlive || (this.pos.distanceTo(this.home) > LEASH_R * (this.boss ? 0.8 : 1) && dist > 6)) {
          this.setState('return');
          break;
        }
        if (this.boss && this.novaCd <= 0 && dist < 9) {
          this.novaCd = 7 + Math.random() * 3;
          this.startWindup(ctx, 'nova');
          break;
        }
        this.chase(ctx, dist, dx, dz, dt);
        break;
      }
      case 'windup': {
        if (this.chargeDir.lengthSq() === 0 || def.behavior !== 'charger') this.face(dx, dz, dt, 6);
        if (this.stateT >= (this.special === 'nova' ? 1.1 : windup)) this.release(ctx, dist);
        break;
      }
      case 'charge': {
        const step = 15 * dt;
        this.moving = 1;
        moveCircle(this.pos, this.chargeDir.x * step, this.chargeDir.z * step, this.radius, ctx.terrain, ctx.obstacles(this.pos.x, this.pos.z));
        if (!this.chargeHit && dist < this.radius + p.radius + 0.4) {
          this.chargeHit = true;
          ctx.combat.hurtPlayer(this.dmg * 1.3, this, true, this.chargeDir.clone().multiplyScalar(9));
        }
        if (this.stateT > 0.6) this.setState('recover');
        break;
      }
      case 'recover': {
        if (def.behavior === 'melee' || def.behavior === 'flyer') this.stepToward(ctx, p.pos.x, p.pos.z, this.speed * 0.4, dt, def.range * 0.6);
        if (this.stateT > 0.35) this.setState('chase');
        break;
      }
    }

    // Separation from other enemies.
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const min = this.radius + o.radius;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        moveCircle(this.pos, (ox / d) * push, (oz / d) * push, this.radius, ctx.terrain, []);
      }
    }

    // Visuals.
    this.attackAnim = this.attackAnim >= 0 ? this.attackAnim + dt * 3.2 : -1;
    if (this.attackAnim > 1) this.attackAnim = -1;
    this.group.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    this.rig.animate({
      t: t + this.id,
      move: this.moving,
      attack: this.attackAnim,
      windup: this.state === 'windup' ? Math.min(1, this.stateT / windup) : -1,
    });
    if (this.flash > 0) {
      this.flash -= dt;
      for (const m of this.rig.mats) {
        if (this.flash > 0) {
          m.emissive.set('#ffffff');
          m.emissiveIntensity = 0.9;
        } else {
          m.emissive.setHex(m.userData.emissive);
          m.emissiveIntensity = m.userData.ei;
        }
      }
    }
    this.bar.visible = !this.boss && (this.hp < this.maxHp || this.elite);
    if (this.bar.visible) {
      this.bar.quaternion.copy(ctx.camera.quaternion);
      const w = this.elite ? 1.6 : 1;
      this.fill.scale.x = Math.max(0.001, (this.hp / this.maxHp) * w);
    }
  }

  private special: 'nova' | null = null;

  private chase(ctx: Ctx, dist: number, dx: number, dz: number, dt: number) {
    const def = this.def;
    const p = ctx.player;
    switch (def.behavior) {
      case 'melee':
      case 'flyer': {
        const reach = def.range * this.scale + p.radius;
        if (dist > reach * 0.85) {
          const weave = def.behavior === 'flyer' ? Math.sin(this.stateT * 6 + this.id) * 2.5 : 0;
          const px = -dz / (dist || 1);
          const pz = dx / (dist || 1);
          this.stepToward(ctx, p.pos.x + px * weave, p.pos.z + pz * weave, this.speed, dt);
        } else if (this.cd <= 0) this.startWindup(ctx, null);
        else this.face(dx, dz, dt);
        break;
      }
      case 'ranged': {
        if (dist > 10) this.stepToward(ctx, p.pos.x, p.pos.z, this.speed, dt);
        else if (dist < 5) this.stepToward(ctx, this.pos.x - dx, this.pos.z - dz, this.speed * 0.9, dt);
        else {
          const side = this.id % 2 ? 1 : -1;
          this.stepToward(ctx, this.pos.x - (dz / dist) * side, this.pos.z + (dx / dist) * side, this.speed * 0.35, dt);
          this.face(dx, dz, dt);
        }
        if (this.cd <= 0 && dist < 13) this.startWindup(ctx, null);
        break;
      }
      case 'charger': {
        if (dist > 8) this.stepToward(ctx, p.pos.x, p.pos.z, this.speed, dt);
        else if (this.cd <= 0) this.startWindup(ctx, null);
        else this.stepToward(ctx, p.pos.x, p.pos.z, this.speed * 0.5, dt, 3);
        break;
      }
      case 'slam': {
        const reach = def.range * this.scale * 0.8;
        if (dist > reach) this.stepToward(ctx, p.pos.x, p.pos.z, this.speed, dt);
        else if (this.cd <= 0) this.startWindup(ctx, null);
        break;
      }
    }
  }

  private startWindup(ctx: Ctx, special: 'nova' | null) {
    this.special = special;
    this.setState('windup');
    this.chargeDir.set(0, 0, 0);
    const def = this.def;
    const swift = this.mods.includes('swift');
    const dur = special === 'nova' ? 1.1 : def.windup * (swift ? 0.75 : 1) * (this.boss ? 1.15 : 1);
    if (special === 'nova') {
      this.telegraph = ctx.telegraphs.circle(this.pos, 6.5, dur);
      return;
    }
    if (def.behavior === 'charger') {
      const p = ctx.player.pos;
      this.chargeDir.set(p.x - this.pos.x, 0, p.z - this.pos.z).normalize();
      this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      this.telegraph = ctx.telegraphs.line(this.pos, this.facing, 9.5, this.radius * 2 + 0.4, dur);
    } else if (def.behavior === 'slam') {
      this.telegraph = ctx.telegraphs.circle(this.pos, def.range * this.scale, dur);
    } else if (this.boss) {
      this.telegraph = ctx.telegraphs.circle(this.pos, def.range * this.scale + 0.8, dur);
    }
  }

  private release(ctx: Ctx, dist: number) {
    const def = this.def;
    const p = ctx.player;
    const swift = this.mods.includes('swift');
    this.cd = def.cooldown * (swift ? 0.7 : 1);
    this.telegraph = null;

    if (this.special === 'nova') {
      this.special = null;
      ctx.combat.shockwave(this.pos, 6.5, this.dmg * 0.9, this);
      this.setState('recover');
      return;
    }
    switch (def.behavior) {
      case 'melee':
      case 'flyer': {
        this.attackAnim = 0;
        const reach = def.range * this.scale + p.radius + 0.6 + (this.boss ? 0.8 : 0);
        if (dist < reach) ctx.combat.hurtPlayer(this.dmg, this, true);
        ctx.sfx.enemySwing();
        this.setState('recover');
        break;
      }
      case 'ranged': {
        const count = this.boss ? 5 : 1;
        for (let k = 0; k < count; k++) {
          const spread = (k - (count - 1) / 2) * 0.18;
          ctx.combat.fireArrow(this, spread);
        }
        this.setState('recover');
        break;
      }
      case 'charger':
        this.chargeHit = false;
        ctx.sfx.charge();
        this.setState('charge');
        break;
      case 'slam':
        ctx.combat.shockwave(this.pos, def.range * this.scale, this.dmg, this);
        this.setState('recover');
        break;
    }
  }

  remove(ctx: Ctx) {
    this.cancelTelegraph(ctx);
    this.group.removeFromParent();
    for (const m of this.rig.mats) m.dispose();
    this.auraMat?.dispose();
  }
}
