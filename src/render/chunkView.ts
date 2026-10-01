import * as THREE from 'three';
import { CHUNK, CHUNK_RES } from '../config';
import type { PropKind } from '../world/biomes';
import type { ChunkData, Poi, ShrineKind } from '../world/chunkGen';
import type { Terrain } from '../world/terrain';
import { GLOW_MATERIAL, PROP_MATERIAL, glows, propGeometry } from './props';

const TERRAIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

const MAT = {
  wood: std('#8a5a36'),
  woodDark: std('#5e3c25'),
  gold: std('#f2c14e', { metalness: 0.4, roughness: 0.4 }),
  cloth: std('#c9a27a'),
  clothRed: std('#b8463a'),
  stone: std('#9c9aa6'),
  stoneDark: std('#4a4552'),
  fire: new THREE.MeshBasicMaterial({ color: '#ffb340' }),
  fireCore: new THREE.MeshBasicMaterial({ color: '#fff1a8' }),
  spent: std('#77757f', { roughness: 1 }),
};

export const SHRINE_COLORS: Record<ShrineKind, string> = {
  fury: '#ff5a3c',
  haste: '#5ee0ff',
  vigor: '#5cff8a',
  fortune: '#ffd84a',
};

const G = {
  tent: (() => {
    const g = new THREE.ConeGeometry(1.4, 1.9, 4);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.95, 0);
    return g;
  })(),
  log: new THREE.CylinderGeometry(0.1, 0.1, 0.9, 5),
  flame: new THREE.ConeGeometry(0.28, 0.75, 5),
  chestBase: new THREE.BoxGeometry(0.9, 0.5, 0.6),
  chestLid: (() => {
    const g = new THREE.BoxGeometry(0.92, 0.22, 0.62);
    g.translate(0, 0.11, 0.31);
    return g;
  })(),
  chestBand: new THREE.BoxGeometry(0.94, 0.08, 0.64),
  pillar: new THREE.CylinderGeometry(0.35, 0.5, 1.3, 6),
  orb: new THREE.IcosahedronGeometry(0.32, 1),
  ring: new THREE.TorusGeometry(0.5, 0.04, 6, 24),
  platform: new THREE.CylinderGeometry(1.6, 1.8, 0.25, 8),
  beam: new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
  bossStone: new THREE.CylinderGeometry(4.5, 4.8, 0.2, 10),
  menhir: new THREE.BoxGeometry(0.6, 2.4, 0.5),
};

export interface ChestView {
  group: THREE.Group;
  lid: THREE.Object3D;
  glow: THREE.PointLight | null;
  sparkle: THREE.Mesh;
}

export class ChunkView {
  readonly group = new THREE.Group();
  readonly chests = new Map<string, ChestView>();
  readonly shrines = new Map<string, { orb: THREE.Mesh; ring: THREE.Mesh; mat: THREE.MeshStandardMaterial }>();
  readonly beams = new Map<string, THREE.Mesh>();
  private flames: THREE.Object3D[] = [];
  private owned: { dispose(): void }[] = [];

  constructor(
    data: ChunkData,
    private terrain: Terrain,
  ) {
    this.group.add(this.buildTerrain(data));
    this.buildProps(data);
    for (const poi of data.pois) this.buildPoi(poi);
  }

  private buildTerrain(data: ChunkData) {
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, CHUNK_RES, CHUNK_RES);
    g.rotateX(-Math.PI / 2);
    const ox = data.cx * CHUNK;
    const oz = data.cz * CHUNK;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox;
      const z = pos.getZ(i) + oz;
      const h = this.terrain.height(x, z);
      pos.setY(i, h);
      this.terrain.groundColor(x, z, h, c);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.owned.push(g);
    const mesh = new THREE.Mesh(g, TERRAIN_MAT);
    mesh.position.set(ox, 0, oz);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildProps(data: ChunkData) {
    const byKind = new Map<PropKind, typeof data.props>();
    for (const p of data.props) {
      let list = byKind.get(p.kind);
      if (!list) byKind.set(p.kind, (list = []));
      list.push(p);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, list] of byKind) {
      const inst = new THREE.InstancedMesh(propGeometry(kind), glows(kind) ? GLOW_MATERIAL : PROP_MATERIAL, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = kind !== 'flower' && kind !== 'reed';
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.owned.push(inst);
      this.group.add(inst);
    }
  }

  private buildPoi(poi: Poi) {
    const y = this.terrain.height(poi.x, poi.z);
    const root = new THREE.Group();
    root.position.set(poi.x, y, poi.z);
    this.group.add(root);

    if (poi.type === 'camp') {
      for (const [a, r] of [
        [0.6, 3.8],
        [2.6, 4.2],
      ]) {
        const tent = new THREE.Mesh(G.tent, a > 1 ? MAT.clothRed : MAT.cloth);
        tent.position.set(Math.cos(a) * r, this.terrain.height(poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r) - y, Math.sin(a) * r);
        tent.rotation.y = -a;
        tent.castShadow = true;
        root.add(tent);
      }
      root.add(this.campfire(-1.8, 0.5));
    }

    if (poi.type === 'camp' || poi.type === 'chest' || poi.type === 'boss') {
      const chest = this.chest(poi.type === 'boss');
      chest.group.position.set(poi.type === 'camp' ? 0.8 : 0, 0, poi.type === 'boss' ? -2.5 : 0);
      chest.group.rotation.y = 0.3;
      root.add(chest.group);
      this.chests.set(poi.id, chest);
    }

    if (poi.type === 'shrine') {
      const color = SHRINE_COLORS[poi.shrine!];
      const base = new THREE.Mesh(G.platform, MAT.stone);
      base.position.y = 0.1;
      base.receiveShadow = true;
      const pillar = new THREE.Mesh(G.pillar, MAT.stone);
      pillar.position.y = 0.85;
      pillar.castShadow = true;
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3 });
      this.owned.push(mat);
      const orb = new THREE.Mesh(G.orb, mat);
      orb.position.y = 2.0;
      const ring = new THREE.Mesh(G.ring, mat);
      ring.position.y = 2.0;
      ring.rotation.x = Math.PI / 2;
      root.add(base, pillar, orb, ring);
      this.shrines.set(poi.id, { orb, ring, mat });
    }

    if (poi.type === 'boss') {
      const stone = new THREE.Mesh(G.bossStone, MAT.stoneDark);
      stone.position.y = 0.05;
      stone.receiveShadow = true;
      root.add(stone);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const m = new THREE.Mesh(G.menhir, MAT.stoneDark);
        m.position.set(Math.cos(a) * 5.2, 1.1, Math.sin(a) * 5.2);
        m.rotation.y = -a;
        m.castShadow = true;
        root.add(m);
      }
      const beamMat = new THREE.MeshBasicMaterial({
        color: '#c06bff',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.owned.push(beamMat);
      const beam = new THREE.Mesh(G.beam, beamMat);
      beam.position.y = 30;
      root.add(beam);
      this.beams.set(poi.id, beam);
    }
  }

  private campfire(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    for (let k = 0; k < 3; k++) {
      const log = new THREE.Mesh(G.log, MAT.woodDark);
      log.rotation.set(Math.PI / 2, (k * Math.PI) / 3, 0);
      log.position.y = 0.1;
      g.add(log);
    }
    const flame = new THREE.Mesh(G.flame, MAT.fire);
    flame.position.y = 0.45;
    const core = new THREE.Mesh(G.flame, MAT.fireCore);
    core.scale.setScalar(0.55);
    core.position.y = 0.35;
    g.add(flame, core);
    this.flames.push(flame, core);
    return g;
  }

  private chest(big: boolean): ChestView {
    const group = new THREE.Group();
    const base = new THREE.Mesh(G.chestBase, MAT.wood);
    base.position.y = 0.25;
    base.castShadow = true;
    const band = new THREE.Mesh(G.chestBand, MAT.gold);
    band.position.y = 0.3;
    const lid = new THREE.Group();
    lid.position.set(0, 0.5, -0.31);
    lid.add(new THREE.Mesh(G.chestLid, MAT.wood));
    const sparkle = new THREE.Mesh(G.orb, MAT.fireCore);
    sparkle.scale.setScalar(0.4);
    sparkle.position.y = 1.2;
    sparkle.visible = false;
    group.add(base, band, lid, sparkle);
    if (big) group.scale.setScalar(1.5);
    return { group, lid, glow: null, sparkle };
  }

  update(t: number) {
    this.flames.forEach((f, k) => {
      const s = 1 + Math.sin(t * 13 + k * 2) * 0.15;
      f.scale.set(s * (k % 2 ? 0.55 : 1), (k % 2 ? 0.55 : 1) * (1 + Math.sin(t * 9 + k) * 0.2), s * (k % 2 ? 0.55 : 1));
    });
    for (const s of this.shrines.values()) {
      s.orb.position.y = 2.0 + Math.sin(t * 2) * 0.12;
      s.ring.rotation.z = t * 1.5;
    }
    for (const c of this.chests.values()) {
      if (c.sparkle.visible) {
        c.sparkle.position.y = 1.2 + Math.sin(t * 4) * 0.12;
        c.sparkle.rotation.y = t * 3;
      }
    }
  }

  setShrineUsed(id: string) {
    const s = this.shrines.get(id);
    if (!s) return;
    s.orb.material = MAT.spent;
    s.ring.visible = false;
  }

  setChestState(id: string, state: 'locked' | 'ready' | 'open') {
    const c = this.chests.get(id);
    if (!c) return;
    c.sparkle.visible = state === 'ready';
    c.lid.rotation.x = state === 'open' ? -1.9 : 0;
  }

  hideBeam(id: string) {
    const b = this.beams.get(id);
    if (b) b.visible = false;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
  }
}
