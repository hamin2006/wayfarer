import type * as THREE from 'three';
import { LOAD_RADIUS } from '../config';
import { ChunkView } from '../render/chunkView';
import { chunkKey, chunkOf, generateChunk, type ChunkData, type PropInst } from './chunkGen';
import type { Terrain } from './terrain';

export interface LoadedChunk {
  data: ChunkData;
  view: ChunkView;
}

/** Streams chunks in around the player and out behind them. */
export class World {
  readonly chunks = new Map<string, LoadedChunk>();
  onLoad: (c: LoadedChunk) => void = () => {};
  onUnload: (c: LoadedChunk) => void = () => {};

  constructor(
    readonly terrain: Terrain,
    private scene: THREE.Scene,
  ) {}

  private load(cx: number, cz: number) {
    const data = generateChunk(this.terrain, cx, cz);
    const view = new ChunkView(data, this.terrain);
    this.scene.add(view.group);
    const c = { data, view };
    this.chunks.set(data.key, c);
    this.onLoad(c);
  }

  /** Loads up to `budget` missing chunks (nearest first) and unloads distant ones. */
  update(x: number, z: number, budget = 1) {
    const pcx = chunkOf(x);
    const pcz = chunkOf(z);
    const missing: [number, number, number][] = [];
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!this.chunks.has(chunkKey(cx, cz))) missing.push([cx, cz, dx * dx + dz * dz]);
      }
    }
    missing.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of missing.slice(0, budget)) this.load(cx, cz);

    for (const [key, c] of this.chunks) {
      if (Math.abs(c.data.cx - pcx) > LOAD_RADIUS + 1 || Math.abs(c.data.cz - pcz) > LOAD_RADIUS + 1) {
        this.onUnload(c);
        c.view.dispose();
        this.chunks.delete(key);
      }
    }
  }

  /** Solid props in the 3×3 chunks around a point. */
  obstacles(x: number, z: number, out: PropInst[] = []): PropInst[] {
    out.length = 0;
    const pcx = chunkOf(x);
    const pcz = chunkOf(z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
        if (!c) continue;
        for (const p of c.data.props) if (p.radius > 0) out.push(p);
      }
    }
    return out;
  }

  update3d(t: number) {
    for (const c of this.chunks.values()) c.view.update(t);
  }

  clear() {
    for (const c of this.chunks.values()) {
      this.onUnload(c);
      c.view.dispose();
    }
    this.chunks.clear();
  }
}
