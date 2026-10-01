import type * as THREE from 'three';
import type { Sfx } from '../audio/sfx';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { FloatText, Particles, Telegraphs } from '../render/fx';
import type { UI } from '../ui/ui';
import type { PropInst } from '../world/chunkGen';
import type { Terrain } from '../world/terrain';
import type { World } from '../world/world';
import type { Combat } from './combat';
import type { Loot } from './loot';

/** Everything systems need to talk to each other, passed around instead of globals. */
export interface Ctx {
  terrain: Terrain;
  world: World;
  scene: THREE.Scene;
  camera: THREE.Camera;
  player: Player;
  enemies: Enemy[];
  particles: Particles;
  telegraphs: Telegraphs;
  text: FloatText;
  sfx: Sfx;
  ui: UI;
  combat: Combat;
  loot: Loot;
  obstacles(x: number, z: number): PropInst[];
  shake(amount: number): void;
  hitstop(seconds: number): void;
  onEnemyKilled(e: Enemy): void;
  onPlayerDeath(): void;
}
