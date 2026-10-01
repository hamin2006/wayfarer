import * as THREE from 'three';
import { DAY_LENGTH, LOAD_RADIUS } from '../config';
import { Sfx } from '../audio/sfx';
import { PERKS, perkChoices } from '../combat/perks';
import { BUFFS, type BuffKind } from '../combat/stats';
import { Enemy } from '../entities/enemy';
import { ELITE_MODS, enemyXp } from '../entities/enemyDefs';
import { Player, type Ability } from '../entities/player';
import { FollowCam } from '../input/camera';
import { Input } from '../input/input';
import { salvageValue, type Item } from '../loot/items';
import { FloatText, Particles, Telegraphs } from '../render/fx';
import { SHRINE_COLORS } from '../render/chunkView';
import { Stage } from '../render/stage';
import { Minimap } from '../ui/minimap';
import { UI } from '../ui/ui';
import { chunkKey, chunkOf, generateChunk, type Poi, type PropInst } from '../world/chunkGen';
import { moveCircle } from '../world/collide';
import { Terrain } from '../world/terrain';
import { World, type LoadedChunk } from '../world/world';
import { Combat } from './combat';
import type { Ctx } from './ctx';
import { Loot } from './loot';
import { clearGame, loadGame, writeGame, type SaveData } from './save';

const DASH_SPEED = 28;
const RECALL_TIME = 2.5;
const FAR_SCAN_RADIUS = 5;

interface PoiState {
  poi: Poi;
  chunk: string;
  warned: number;
}

export class Game {
  private stage: Stage;
  private cam: FollowCam;
  private input: Input;
  private ui = new UI();
  private sfx = new Sfx();
  private particles: Particles;
  private telegraphs: Telegraphs;
  private text: FloatText;
  private minimap!: Minimap;
  private terrain!: Terrain;
  private world!: World;
  private player!: Player;
  private combat!: Combat;
  private loot!: Loot;
  private ctx!: Ctx;

  private enemies: Enemy[] = [];
  private pois = new Map<string, PoiState>();
  private farPois: Poi[] = [];
  private farScanAt = { cx: Infinity, cz: Infinity };
  private done = new Set<string>();
  private stats = { kills: 0, bosses: 0, deaths: 0, farthest: 0 };
  private seed = 0;
  private dayTime = 0.08;
  private time = 0;
  private hitstopT = 0;
  private saveTimer = 0;
  private mapTimer = 0;
  private pendingPerks = 0;
  private deathTimer = -1;
  private dashTrail = 0;
  private hurtFlash = 0;
  private lastHp = 0;
  private obstacleBuf: PropInst[] = [];
  private timer = new THREE.Timer();

  constructor(container: HTMLElement) {
    this.stage = new Stage(container);
    this.cam = new FollowCam(this.stage.camera);
    this.input = new Input(this.stage.renderer.domElement, this.stage.camera);
    this.particles = new Particles(this.stage.scene);
    this.telegraphs = new Telegraphs(this.stage.scene);
    this.text = new FloatText(this.stage.camera);

    const save = loadGame();
    this.startWorld(save);
    this.wireInput();
    this.ui.muted = this.sfx.muted = save?.muted ?? false;

    if (!save) this.ui.showWelcome();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
        if (!this.ui.modalOpen && !this.player.dead) this.ui.showPause(this.stats);
      }
    });
    window.addEventListener('pagehide', () => this.save());
    this.stage.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- Setup ----------

  private startWorld(save: SaveData | null) {
    this.seed = save?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.terrain = new Terrain(this.seed);
    this.world = new World(this.terrain, this.stage.scene);
    if (this.minimap) this.minimap.setTerrain(this.terrain);
    else {
      this.minimap = new Minimap(this.terrain);
      this.ui.hudTopRight.prepend(this.minimap.canvas);
    }
    this.player = new Player();
    this.stage.scene.add(this.player.rig.root);
    this.ui.setPlayer(this.player);
    this.done = new Set(save?.done ?? []);
    this.stats = save?.stats ?? { kills: 0, bosses: 0, deaths: 0, farthest: 0 };
    this.ui.pauseStats = this.stats;
    this.dayTime = save?.dayTime ?? 0.08;

    const p = this.player;
    if (save) {
      const s = save.player;
      p.level = s.level;
      p.xp = s.xp;
      p.gold = s.gold;
      p.perks = s.perks;
      p.equipped = s.equipped;
      p.bag = s.bag;
      p.recompute();
      p.hp = Math.max(1, Math.min(s.hp, p.stats.maxHp));
      p.pos.set(s.x, 0, s.z);
    }
    if (!this.terrain.walkable(p.pos.x, p.pos.z)) p.pos.set(0, 0, 0);
    p.pos.y = this.terrain.height(p.pos.x, p.pos.z);
    this.lastHp = p.hp;

    this.ctx = {
      terrain: this.terrain,
      world: this.world,
      scene: this.stage.scene,
      camera: this.stage.camera,
      player: this.player,
      enemies: this.enemies,
      particles: this.particles,
      telegraphs: this.telegraphs,
      text: this.text,
      sfx: this.sfx,
      ui: this.ui,
      combat: null!,
      loot: null!,
      obstacles: (x, z) => this.world.obstacles(x, z, this.obstacleBuf),
      shake: (a) => this.cam.shake(a),
      hitstop: (s) => (this.hitstopT = Math.max(this.hitstopT, s)),
      onEnemyKilled: (e) => this.onEnemyKilled(e),
      onPlayerDeath: () => this.onPlayerDeath(),
    };
    this.combat = this.ctx.combat = new Combat(this.ctx);
    this.loot = this.ctx.loot = new Loot(this.ctx);

    this.world.onLoad = (c) => this.onChunkLoad(c);
    this.world.onUnload = (c) => this.onChunkUnload(c);
    this.world.update(p.pos.x, p.pos.z, 999);
    this.cam.snap(p.pos);
    this.farScanAt = { cx: Infinity, cz: Infinity };
  }

  private newWorld() {
    clearGame();
    this.world.clear();
    for (const e of this.enemies) e.remove(this.ctx);
    this.enemies.length = 0;
    this.combat.clear();
    this.loot.clear();
    this.pois.clear();
    this.player.rig.root.removeFromParent();
    this.startWorld(null);
    this.ui.showWelcome();
  }

  private wireInput() {
    this.input.onAbility = (a) => this.useAbility(a);
    this.input.onKey = (k) => {
      this.sfx.unlock();
      if (this.ui.handleKey(k)) return;
      if (k === 'escape') this.ui.showPause(this.stats);
      else if (k === 'h') this.useAbility('recall');
      else if (k === 'm') this.toggleMute();
    };
    this.ui.onAbility = (a) => this.useAbility(a);
    this.ui.onModalChange = (open) => {
      this.input.enabled = !open;
      if (!open) {
        if (this.pendingPerks > 0 && !this.player.dead) setTimeout(() => this.offerPerk(), 150);
      }
    };
    this.ui.onPerk = (id) => {
      this.player.perks[id] = (this.player.perks[id] ?? 0) + 1;
      this.player.recompute();
      this.pendingPerks--;
      this.sfx.click();
      this.ui.toast(`${PERKS[id].icon} ${PERKS[id].name} — ${PERKS[id].desc}`, 'good');
      this.save();
    };
    this.ui.onEquip = (item) => {
      this.player.equip(item);
      this.sfx.click();
      this.save();
    };
    this.ui.onSalvage = (items: Item[]) => {
      let gold = 0;
      for (const it of items) {
        const i = this.player.bag.indexOf(it);
        if (i < 0) continue;
        this.player.bag.splice(i, 1);
        gold += salvageValue(it);
      }
      if (!gold) return;
      this.player.gold += gold;
      this.sfx.coin();
      this.ui.toast(`Salvaged for 🪙 ${gold}`);
      this.save();
    };
    this.ui.onRespawn = () => this.respawn();
    this.ui.onNewWorld = () => this.newWorld();
    this.ui.onMute = () => this.toggleMute();
    this.ui.onBegin = () => {
      this.sfx.unlock();
      this.ui.announce('Hearthvale Village', 'Danger grows the further you roam', 3000, 'region');
      this.save();
    };
    document.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
  }

  private toggleMute() {
    this.sfx.muted = !this.sfx.muted;
    this.ui.muted = this.sfx.muted;
    this.save();
  }

  // ---------- Chunks & points of interest ----------

  private onChunkLoad(c: LoadedChunk) {
    const { data, view } = c;
    for (const poi of data.pois) {
      this.pois.set(poi.id, { poi, chunk: data.key, warned: 0 });
      const cleared = this.done.has(poi.id);
      if (poi.type === 'camp' || poi.type === 'boss') {
        if (!cleared) for (const s of poi.spawns) this.enemies.push(Enemy.create(s, data.key, poi.id, this.ctx));
        view.setChestState(poi.id, this.done.has(`${poi.id}:chest`) ? 'open' : cleared ? 'ready' : 'locked');
        if (poi.type === 'boss' && cleared) view.hideBeam(poi.id);
      } else if (poi.type === 'chest') {
        view.setChestState(poi.id, cleared ? 'open' : 'ready');
      } else if (poi.type === 'shrine' && cleared) {
        view.setShrineUsed(poi.id);
      }
    }
    for (const s of data.wanderers) this.enemies.push(Enemy.create(s, data.key, null, this.ctx));
  }

  private onChunkUnload(c: LoadedChunk) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.chunkKey === c.data.key) {
        e.remove(this.ctx);
        this.enemies.splice(i, 1);
      }
    }
    for (const poi of c.data.pois) this.pois.delete(poi.id);
  }

  private chestPos(poi: Poi) {
    const off = poi.type === 'camp' ? [0.8, 0] : poi.type === 'boss' ? [0, -2.5] : [0, 0];
    return { x: poi.x + off[0], z: poi.z + off[1] };
  }

  private viewFor(st: PoiState) {
    return this.world.chunks.get(st.chunk)?.view;
  }

  private updatePois() {
    const p = this.player;
    if (p.dead) return;
    for (const st of this.pois.values()) {
      const { poi } = st;
      if (poi.type === 'shrine') {
        if (this.done.has(poi.id) || Math.hypot(p.pos.x - poi.x, p.pos.z - poi.z) > 2) continue;
        this.done.add(poi.id);
        this.applyBuff(poi.shrine!);
        this.viewFor(st)?.setShrineUsed(poi.id);
        this.particles.burst(new THREE.Vector3(poi.x, p.pos.y + 2, poi.z), SHRINE_COLORS[poi.shrine!], 40, 6, 0.15, 3, 1);
        this.save();
        continue;
      }
      const chestId = poi.type === 'chest' ? poi.id : `${poi.id}:chest`;
      if (this.done.has(chestId)) continue;
      const c = this.chestPos(poi);
      if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 1.8) continue;
      const unlocked = poi.type === 'chest' || this.done.has(poi.id);
      if (!unlocked) {
        if (this.time - st.warned > 6) {
          st.warned = this.time;
          this.ui.toast(poi.type === 'boss' ? '🔒 Defeat the boss to open this chest' : '🔒 Clear the camp to unlock this chest', 'warn');
        }
        continue;
      }
      this.done.add(chestId);
      this.viewFor(st)?.setChestState(poi.id, 'open');
      const at = new THREE.Vector3(c.x, this.terrain.height(c.x, c.z), c.z);
      this.loot.fromChest(at, poi.level, poi.type === 'boss' ? 1.5 : poi.type === 'camp' ? 0.5 : 0);
      this.particles.burst(at.clone().setY(at.y + 0.8), '#ffe08a', 24, 5, 0.12, 8, 0.8);
      this.sfx.chest();
      this.save();
    }
  }

  private applyBuff(kind: BuffKind) {
    const p = this.player;
    p.buffs = p.buffs.filter((b) => b.kind !== kind);
    p.buffs.push({ kind, t: BUFFS[kind].duration });
    p.recompute();
    if (kind === 'vigor') p.hp = p.stats.maxHp;
    this.sfx.shrine();
    this.ui.announce(`${BUFFS[kind].icon} ${BUFFS[kind].name}`, BUFFS[kind].desc, 2200);
  }

  // ---------- Combat outcomes ----------

  private onEnemyKilled(e: Enemy) {
    const p = this.player;
    this.stats.kills++;
    this.loot.fromEnemy(e);
    this.gainXp(enemyXp(e.def, e.level, e.elite, e.boss), e.pos);

    if (e.boss && e.poiId) {
      this.done.add(e.poiId);
      this.stats.bosses++;
      const st = this.pois.get(e.poiId);
      if (st) {
        const v = this.viewFor(st);
        v?.hideBeam(e.poiId);
        v?.setChestState(e.poiId, 'ready');
      }
      this.ui.announce('Boss defeated!', `${e.name} has fallen`, 3200, 'boss');
      this.save();
    } else if (e.poiId && this.pois.get(e.poiId)?.poi.type === 'camp') {
      const remaining = this.enemies.some((o) => !o.dead && o.poiId === e.poiId);
      if (!remaining && !this.done.has(e.poiId)) {
        this.done.add(e.poiId);
        const st = this.pois.get(e.poiId)!;
        this.viewFor(st)?.setChestState(e.poiId, 'ready');
        this.ui.toast('⚔️ Camp cleared! Its chest is unlocked.', 'good');
        this.save();
      }
    }
    if (p.hp > 0 && e.elite && !e.boss) this.ui.toast(`Slew ${e.name}`, 'good');
  }

  private gainXp(amount: number, at: THREE.Vector3) {
    const p = this.player;
    p.xp += amount;
    this.text.spawn(at.clone().setY(at.y + 2.2), `+${amount} xp`, 'xp', 0.8);
    while (p.xp >= p.xpNeeded) {
      p.xp -= p.xpNeeded;
      p.level++;
      this.pendingPerks++;
      p.recompute();
      p.hp = p.stats.maxHp;
      this.sfx.levelUp();
      this.particles.burst(p.pos.clone().setY(p.pos.y + 1), '#ffe08a', 40, 6, 0.14, 4, 1);
    }
    if (this.pendingPerks > 0 && !this.ui.modalOpen) setTimeout(() => this.offerPerk(), 700);
  }

  private offerPerk() {
    if (this.pendingPerks <= 0 || this.ui.modalOpen || this.player.dead) return;
    const choices = perkChoices(Math.random, this.player.perks);
    if (!choices.length) {
      this.pendingPerks = 0;
      return;
    }
    this.ui.showPerks(choices, this.player.level);
  }

  private onPlayerDeath() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.recall = -1;
    this.stats.deaths++;
    this.sfx.death();
    this.particles.burst(p.pos.clone().setY(p.pos.y + 1), '#ff4d5e', 30, 5, 0.15, 10, 0.9);
    this.deathTimer = 1.3;
  }

  private respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.stats.maxHp;
    p.burn.t = 0;
    p.knock.set(0, 0, 0);
    this.teleport(0, 0);
    this.save();
  }

  private teleport(x: number, z: number) {
    const p = this.player;
    for (const e of this.enemies) {
      e.aggro = false;
      e.cancelTelegraph(this.ctx);
    }
    p.pos.set(x, this.terrain.height(x, z), z);
    this.world.update(x, z, 999);
    this.cam.snap(p.pos);
    this.particles.burst(p.pos.clone().setY(p.pos.y + 1), '#7df9ff', 40, 5, 0.12, 2, 1);
  }

  // ---------- Abilities ----------

  private useAbility(a: Ability | 'recall') {
    const p = this.player;
    this.sfx.unlock();
    if (this.ui.modalOpen || p.dead) return;
    if (a === 'recall') {
      if (Math.hypot(p.pos.x, p.pos.z) < 20) {
        this.ui.toast("You're already home");
        return;
      }
      if (p.recall < 0) {
        p.recall = 0;
        this.sfx.recall();
      }
      return;
    }
    if (p.cd[a] > 0) return;
    if (a === 'dash') {
      const mx = this.input.move.x;
      const mz = this.input.move.z;
      this.combat.dash(mx, mz);
    } else if (a === 'spin') this.combat.spin();
    else {
      let dx = Math.sin(p.facing);
      let dz = Math.cos(p.facing);
      if (this.input.aimValid) {
        dx = this.input.aim.x - p.pos.x;
        dz = this.input.aim.z - p.pos.z;
      } else {
        let best = 17;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < best) {
            best = d;
            dx = e.pos.x - p.pos.x;
            dz = e.pos.z - p.pos.z;
          }
        }
      }
      const len = Math.hypot(dx, dz) || 1;
      this.combat.bolt(dx / len, dz / len);
    }
  }

  // ---------- Frame ----------

  private updatePlayer(dt: number) {
    const p = this.player;
    const s = p.stats;
    for (const k of Object.keys(p.cd) as Ability[]) p.cd[k] = Math.max(0, p.cd[k] - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    if (p.buffs.length) {
      let changed = false;
      p.buffs = p.buffs.filter((b) => {
        b.t -= dt;
        if (b.t <= 0) changed = true;
        return b.t > 0;
      });
      if (changed) p.recompute();
    }

    if (p.dead) {
      p.rig.root.rotation.z = Math.min(Math.PI / 2, p.rig.root.rotation.z + dt * 5);
      return;
    }
    p.rig.root.rotation.z = 0;

    const obstacles = this.world.obstacles(p.pos.x, p.pos.z, this.obstacleBuf);
    const mv = this.input.move;
    const moving = Math.hypot(mv.x, mv.z);
    if (p.dashT > 0) {
      p.dashT -= dt;
      moveCircle(p.pos, p.dashDir.x * DASH_SPEED * dt, p.dashDir.z * DASH_SPEED * dt, p.radius, this.terrain, obstacles);
      if (Math.random() < 0.8) this.particles.burst(p.pos.clone().setY(p.pos.y + 0.4), '#ffffff', 1, 1, 0.12, 0, 0.3);
      if (s.dashFire > 0 && (this.dashTrail -= dt) <= 0) {
        this.dashTrail = 0.05;
        this.combat.firePatch(p.pos, s.power * 0.6 * s.dashFire);
      }
    } else if (moving > 0.05) {
      const speed = s.moveSpeed * (p.swing >= 0 ? 0.85 : 1);
      moveCircle(p.pos, mv.x * speed * dt, mv.z * speed * dt, p.radius, this.terrain, obstacles);
      if (p.swing < 0) {
        const target = Math.atan2(mv.x, mv.z);
        let diff = target - p.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.facing += diff * Math.min(1, dt * 14);
      }
      if (p.recall >= 0) {
        p.recall = -1;
        this.ui.toast('Recall interrupted');
      }
    }
    p.move += ((p.dashT > 0 ? 1 : moving) - p.move) * Math.min(1, dt * 12);

    if (p.knock.lengthSq() > 0.01) {
      moveCircle(p.pos, p.knock.x * dt, p.knock.z * dt, p.radius, this.terrain, obstacles);
      p.knock.multiplyScalar(Math.exp(-8 * dt));
    }
    // Enemies are solid-ish: don't let the hero stand inside them.
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = p.pos.x - e.pos.x;
      const dz = p.pos.z - e.pos.z;
      const min = p.radius + e.radius;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) moveCircle(p.pos, (dx / d) * (min - d) * 0.6, (dz / d) * (min - d) * 0.6, p.radius, this.terrain, obstacles);
    }

    p.heal(s.regen * dt);
    if (p.burn.t > 0) {
      p.burn.t -= dt;
      p.hp -= p.burn.dps * dt;
      if (Math.random() < dt * 6) this.particles.burst(p.pos.clone().setY(p.pos.y + 1), '#ff7a1f', 1, 1.5, 0.1, -3, 0.4);
      if (p.hp <= 0) {
        p.hp = 0;
        this.onPlayerDeath();
      }
    }

    if (p.recall >= 0) {
      p.recall += dt;
      if (Math.random() < 0.5) this.particles.burst(p.pos.clone().setY(p.pos.y + Math.random() * 2), '#7df9ff', 1, 1, 0.1, -4, 0.6);
      if (p.recall >= RECALL_TIME) {
        p.recall = -1;
        this.teleport(0, 0);
        this.ui.announce('Hearthvale Village', 'Home sweet home', 2000, 'region');
        this.save();
      }
    }
  }

  private animatePlayer(dt: number) {
    const p = this.player;
    p.rig.root.position.copy(p.pos);
    p.rig.root.rotation.y = p.facing + (p.spinT >= 0 ? p.spinT * Math.PI * 2 : 0);
    p.rig.animate({ t: this.time, move: p.move, attack: p.swing, windup: -1 });
    // Red flash when hurt.
    if (p.hp < this.lastHp - 0.5) this.hurtFlash = 0.12;
    this.lastHp = p.hp;
    this.hurtFlash -= dt;
    for (const m of p.rig.mats) {
      m.emissive.set(this.hurtFlash > 0 ? '#ff2a2a' : p.invuln > 0.15 ? '#5ad1ff' : '#000000');
      m.emissiveIntensity = this.hurtFlash > 0 ? 0.8 : 0.4;
    }
  }

  private updateMapAndLabels(dt: number) {
    const p = this.player;
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.2;
      const cx = chunkOf(p.pos.x);
      const cz = chunkOf(p.pos.z);
      if (Math.abs(cx - this.farScanAt.cx) + Math.abs(cz - this.farScanAt.cz) >= 2) {
        // Bosses beyond the loaded area still show on the map rim.
        this.farScanAt = { cx, cz };
        this.farPois = [];
        for (let dx = -FAR_SCAN_RADIUS; dx <= FAR_SCAN_RADIUS; dx++) {
          for (let dz = -FAR_SCAN_RADIUS; dz <= FAR_SCAN_RADIUS; dz++) {
            if (Math.abs(dx) <= LOAD_RADIUS && Math.abs(dz) <= LOAD_RADIUS) continue;
            if (this.world.chunks.has(chunkKey(cx + dx, cz + dz))) continue;
            for (const poi of generateChunk(this.terrain, cx + dx, cz + dz, true).pois) if (poi.type === 'boss') this.farPois.push(poi);
          }
        }
      }
      const pois = [...[...this.pois.values()].map((s) => s.poi), ...this.farPois];
      this.minimap.draw(p.pos.x, p.pos.z, p.facing, pois, this.done);
    }

    const labels: { pos: THREE.Vector3; text: string; color: string }[] = [];
    let boss: Enemy | null = null;
    let bossD = 26;
    for (const e of this.enemies) {
      if (e.dead || !e.elite) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (e.boss && e.aggro && d < bossD) {
        boss = e;
        bossD = d;
      }
      if (d < 28) {
        labels.push({
          pos: e.pos.clone().setY(e.pos.y + e.def.height * e.scale + (e.boss ? 0.6 : 0.6)),
          text: `${e.name} · ${e.level}`,
          color: e.boss ? '#e2a8ff' : ELITE_MODS[e.mods[0]].color,
        });
      }
    }
    this.ui.setLabels(this.stage.camera, labels);
    if (boss && !this.bossShown) this.sfx.boss();
    this.bossShown = !!boss;
    this.ui.bossBar(boss);
  }

  private bossShown = false;

  private frame() {
    this.timer.update();
    const raw = Math.min(this.timer.getDelta(), 1 / 20);
    const p = this.player;
    const paused = this.ui.modalOpen;
    let dt = paused ? 0 : raw;
    if (this.hitstopT > 0) {
      this.hitstopT -= raw;
      dt = 0;
    }
    this.time += dt;

    this.input.update(p.pos.y + 1);
    this.ui.setTouchHints(this.input.touchMode);

    if (dt > 0) {
      this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
      this.world.update(p.pos.x, p.pos.z, 1);
      this.updatePlayer(dt);
      this.combat.updatePlayer(dt);
      for (const e of this.enemies) e.update(dt, this.time, this.ctx);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead && e.state === 'dying' && e.stateT > 0.25) {
          e.remove(this.ctx);
          this.enemies.splice(i, 1);
        }
      }
      this.combat.update(dt);
      this.loot.update(dt, this.time);
      this.updatePois();
      this.telegraphs.update(dt);

      const ring = Math.floor(this.terrain.danger(p.pos.x, p.pos.z));
      if (ring > this.stats.farthest) {
        this.stats.farthest = ring;
        this.ui.toast(`🧭 New frontier — ring ${ring}. Foes grow stronger.`, 'warn');
      }
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) {
          const lost = Math.floor(p.gold * 0.1);
          p.gold -= lost;
          this.ui.showDeath(lost);
        }
      }
      this.saveTimer += dt;
      if (this.saveTimer > 10) this.save();
    }
    this.particles.update(raw);
    this.animatePlayer(raw);
    this.world.update3d(this.time);
    this.cam.update(raw, p.pos, this.time);
    this.stage.update(p.pos, this.dayTime, this.time);
    this.text.update(raw);
    this.updateMapAndLabels(raw);
    this.ui.update(raw, this.terrain.regionName(p.pos.x, p.pos.z), this.terrain.enemyLevel(p.pos.x, p.pos.z));
    this.ui.setLowHealth(!p.dead && p.hp / p.stats.maxHp < 0.25);
    this.stage.render();
  }

  private save() {
    this.saveTimer = 0;
    const p = this.player;
    writeGame({
      version: 1,
      seed: this.seed,
      dayTime: this.dayTime,
      player: {
        x: p.dead ? 0 : p.pos.x,
        z: p.dead ? 0 : p.pos.z,
        level: p.level,
        xp: p.xp,
        hp: p.dead ? p.stats.maxHp : p.hp,
        gold: p.gold,
        perks: p.perks,
        equipped: p.equipped,
        bag: p.bag,
      },
      done: [...this.done],
      stats: this.stats,
      muted: this.sfx.muted,
    });
  }
}
