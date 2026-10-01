import { WATER_Y } from '../config';
import type { Poi } from '../world/chunkGen';
import type { Terrain } from '../world/terrain';
import { BIOMES } from '../world/biomes';

const RANGE = 64;
const CELLS = 32;

/** North-up map of the area around the player with POI markers. */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private bgCenter = { x: Infinity, z: Infinity };

  constructor(private terrain: Terrain) {
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = 256;
    this.bg.width = this.bg.height = CELLS;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setTerrain(t: Terrain) {
    this.terrain = t;
    this.bgCenter.x = Infinity;
  }

  private redrawBackground(cx: number, cz: number) {
    const ctx = this.bg.getContext('2d')!;
    const img = ctx.createImageData(CELLS, CELLS);
    const step = (RANGE * 2) / CELLS;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const x = cx - RANGE + (i + 0.5) * step;
        const z = cz - RANGE + (j + 0.5) * step;
        const h = this.terrain.height(x, z);
        let hex = BIOMES[this.terrain.biome(x, z)].ground[0];
        if (h < WATER_Y) hex = '#4fb3e8';
        const n = parseInt(hex.slice(1), 16);
        const shade = 0.85 + Math.max(-0.15, Math.min(0.15, h * 0.03));
        const o = (j * CELLS + i) * 4;
        img.data[o] = ((n >> 16) & 255) * shade;
        img.data[o + 1] = ((n >> 8) & 255) * shade;
        img.data[o + 2] = (n & 255) * shade;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.bgCenter = { x: cx, z: cz };
  }

  draw(px: number, pz: number, facing: number, pois: Poi[], done: Set<string>) {
    // Re-render the terrain only after moving a bit; slide it in between.
    if (Math.hypot(px - this.bgCenter.x, pz - this.bgCenter.z) > 6) this.redrawBackground(px, pz);
    const ctx = this.ctx;
    const S = this.canvas.width;
    const k = S / (RANGE * 2);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    const ox = (this.bgCenter.x - px) * k;
    const oz = (this.bgCenter.z - pz) * k;
    ctx.drawImage(this.bg, ox, oz, S, S);

    const toMap = (x: number, z: number) => [S / 2 + (x - px) * k, S / 2 + (z - pz) * k] as const;

    // Village marker (or an arrow on the rim pointing home).
    const [vx, vy] = toMap(0, 0);
    const dHome = Math.hypot(px, pz);
    if (dHome < RANGE * 0.92) this.icon(vx, vy, '🏠', 22);
    else {
      const a = Math.atan2(-pz, -px);
      this.icon(S / 2 + Math.cos(a) * (S / 2 - 16), S / 2 + Math.sin(a) * (S / 2 - 16), '🏠', 18, 0.85);
    }

    for (const p of pois) {
      const [x, y] = toMap(p.x, p.z);
      const isDone = done.has(p.id);
      if (p.type === 'boss') {
        if (isDone) continue;
        // Bosses show on the rim even when off-map, so they pull you toward them.
        const d = Math.hypot(x - S / 2, y - S / 2);
        if (d > S / 2 - 14) {
          const a = Math.atan2(y - S / 2, x - S / 2);
          this.icon(S / 2 + Math.cos(a) * (S / 2 - 14), S / 2 + Math.sin(a) * (S / 2 - 14), '💀', 18, 0.9);
        } else this.icon(x, y, '💀', 24);
      } else if (p.type === 'camp') {
        this.dot(x, y, isDone ? '#8a8a8a' : '#ff4d4d', 7);
      } else if (p.type === 'chest' && !isDone) {
        this.dot(x, y, '#ffd23f', 6);
      } else if (p.type === 'shrine' && !isDone) {
        this.dot(x, y, '#7df9ff', 6);
      }
    }

    // Player arrow.
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-facing + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1d2333';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  private dot(x: number, y: number, color: string, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }

  private icon(x: number, y: number, emoji: string, size: number, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
    ctx.globalAlpha = 1;
  }
}
