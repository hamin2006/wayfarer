import type { Vector3 } from 'three';
import type { PropInst } from './chunkGen';
import type { Terrain } from './terrain';

/**
 * Moves a circle across the terrain: slides along water edges, pushes out of solid props, then snaps to
 * the ground. Returns false if it couldn't move at all.
 */
export function moveCircle(pos: Vector3, dx: number, dz: number, radius: number, terrain: Terrain, obstacles: PropInst[]) {
  let nx = pos.x + dx;
  let nz = pos.z + dz;
  if (!terrain.walkable(nx, nz)) {
    if (terrain.walkable(nx, pos.z)) nz = pos.z;
    else if (terrain.walkable(pos.x, nz)) nx = pos.x;
    else return false;
  }
  for (const o of obstacles) {
    const ox = nx - o.x;
    const oz = nz - o.z;
    const min = radius + o.radius;
    const d2 = ox * ox + oz * oz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nx = o.x + (ox / d) * min;
      nz = o.z + (oz / d) * min;
    }
  }
  if (!terrain.walkable(nx, nz)) return false;
  pos.x = nx;
  pos.z = nz;
  pos.y = terrain.height(nx, nz);
  return true;
}
