import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropKind } from '../world/biomes';

const tmpColor = new THREE.Color();

/** A primitive coloured via vertex colours and placed with a transform, ready for merging. */
function part(
  geo: THREE.BufferGeometry,
  color: string,
  pos: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  rot: [number, number, number] = [0, 0, 0],
) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  tmpColor.set(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg);
const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
const dodec = (r: number) => new THREE.DodecahedronGeometry(r, 0);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const octa = (r: number) => new THREE.OctahedronGeometry(r, 0);

function build(kind: PropKind): THREE.BufferGeometry {
  const T = '#7a5134';
  switch (kind) {
    case 'oak':
      return mergeGeometries([
        part(cyl(0.16, 0.22, 1.4), T, [0, 0.7, 0]),
        part(ico(1.05), '#4fa83e', [0, 2.0, 0]),
        part(ico(0.75), '#5cb848', [0.55, 2.45, 0.2]),
        part(ico(0.65), '#46993a', [-0.5, 2.3, -0.3]),
      ]);
    case 'pine':
      return mergeGeometries([
        part(cyl(0.12, 0.18, 1.0), T, [0, 0.5, 0]),
        part(cone(1.05, 1.5), '#2f7d4a', [0, 1.55, 0]),
        part(cone(0.8, 1.3), '#358a52', [0, 2.3, 0]),
        part(cone(0.5, 1.0), '#3c9659', [0, 2.95, 0]),
      ]);
    case 'snowpine':
      return mergeGeometries([
        part(cyl(0.12, 0.18, 1.0), T, [0, 0.5, 0]),
        part(cone(1.05, 1.5), '#3b7a5e', [0, 1.55, 0]),
        part(cone(0.85, 0.5), '#f4f8fc', [0, 2.0, 0]),
        part(cone(0.75, 1.3), '#447f66', [0, 2.35, 0]),
        part(cone(0.55, 0.5), '#ffffff', [0, 2.8, 0]),
      ]);
    case 'bush':
      return mergeGeometries([
        part(ico(0.5), '#4ea543', [0, 0.35, 0]),
        part(ico(0.38), '#5bb54d', [0.4, 0.3, 0.1]),
        part(ico(0.34), '#469a3c', [-0.35, 0.28, -0.15]),
      ]);
    case 'rock':
      return part(dodec(0.6), '#9a9aa5', [0, 0.25, 0], [1, 0.65, 0.9]);
    case 'boulder':
      return mergeGeometries([
        part(dodec(1.1), '#6d6670', [0, 0.5, 0], [1, 0.75, 0.9]),
        part(dodec(0.6), '#7b737e', [0.8, 0.25, 0.4], [1, 0.7, 1]),
      ]);
    case 'flower': {
      const colors = ['#ff7eb6', '#ffe066', '#ffffff', '#b38cff'];
      return mergeGeometries([
        part(ico(0.22), '#5fb84e', [0, 0.1, 0], [1.4, 0.5, 1.4]),
        ...[0, 1, 2].map((k) =>
          part(octa(0.09), colors[k % colors.length], [Math.cos(k * 2.1) * 0.22, 0.28, Math.sin(k * 2.1) * 0.22]),
        ),
      ]);
    }
    case 'cactus':
      return mergeGeometries([
        part(cyl(0.28, 0.32, 2.0, 7), '#4f9e4c', [0, 1.0, 0]),
        part(cyl(0.16, 0.16, 0.7, 6), '#57a854', [0.45, 1.1, 0], [1, 1, 1], [0, 0, Math.PI / 2]),
        part(cyl(0.15, 0.15, 0.7, 6), '#57a854', [0.72, 1.4, 0]),
        part(cyl(0.14, 0.14, 0.5, 6), '#57a854', [-0.4, 0.9, 0], [1, 1, 1], [0, 0, Math.PI / 2]),
        part(cyl(0.13, 0.13, 0.5, 6), '#57a854', [-0.6, 1.15, 0]),
      ]);
    case 'deadtree':
      return mergeGeometries([
        part(cyl(0.1, 0.2, 2.2, 5), '#6b5a4c', [0, 1.1, 0]),
        part(cyl(0.05, 0.09, 1.0, 5), '#6b5a4c', [0.35, 1.8, 0], [1, 1, 1], [0, 0, -0.8]),
        part(cyl(0.05, 0.08, 0.8, 5), '#6b5a4c', [-0.3, 1.5, 0.1], [1, 1, 1], [0.2, 0, 0.9]),
      ]);
    case 'mushroom':
      return mergeGeometries([
        part(cyl(0.1, 0.14, 0.45, 6), '#f3eadb', [0, 0.22, 0]),
        part(new THREE.SphereGeometry(0.34, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#e8483d', [0, 0.42, 0]),
        part(cyl(0.06, 0.08, 0.25, 5), '#f3eadb', [0.3, 0.12, 0.15]),
        part(new THREE.SphereGeometry(0.17, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#e8483d', [0.3, 0.24, 0.15]),
      ]);
    case 'crystal':
      return mergeGeometries([
        part(octa(0.35), '#9f7bff', [0, 0.6, 0], [0.7, 2.0, 0.7]),
        part(octa(0.25), '#7fd8ff', [0.35, 0.4, 0.1], [0.7, 1.6, 0.7], [0, 0, -0.4]),
        part(octa(0.22), '#c49bff', [-0.3, 0.35, -0.1], [0.7, 1.5, 0.7], [0.2, 0, 0.5]),
      ]);
    case 'reed':
      return mergeGeometries(
        [0, 1, 2, 3, 4].map((k) =>
          part(box(0.05, 1.1 + (k % 3) * 0.25, 0.05), k % 2 ? '#8fae4a' : '#a4bd5a', [Math.cos(k * 1.3) * 0.25, 0.55, Math.sin(k * 1.3) * 0.25], [1, 1, 1], [0.1 * k, 0, 0.12 * (k - 2)]),
        ),
      );
    case 'house':
      return mergeGeometries([
        part(box(4, 2.4, 3.6), '#f4e6c8', [0, 1.2, 0]),
        part(box(4.2, 0.3, 3.8), '#a8774d', [0, 0.15, 0]),
        part(cone(3.4, 1.8, 4), '#d0573f', [0, 3.3, 0], [1, 1, 0.82], [0, Math.PI / 4, 0]),
        part(box(0.9, 1.5, 0.1), '#7a4e2d', [0, 0.75, 1.82]),
        part(box(0.7, 0.6, 0.1), '#8fd3ff', [-1.2, 1.5, 1.82]),
        part(box(0.7, 0.6, 0.1), '#8fd3ff', [1.2, 1.5, 1.82]),
        part(box(0.4, 1.0, 0.4), '#8b8b95', [1.2, 3.6, -0.6]),
      ]);
    case 'well':
      return mergeGeometries([
        part(cyl(0.85, 0.9, 0.8, 10), '#9a9aa5', [0, 0.4, 0]),
        part(cyl(0.65, 0.65, 0.05, 10), '#3d7fb8', [0, 0.7, 0]),
        part(box(0.12, 1.6, 0.12), T, [0.7, 1.2, 0]),
        part(box(0.12, 1.6, 0.12), T, [-0.7, 1.2, 0]),
        part(cone(1.1, 0.7, 4), '#d0573f', [0, 2.25, 0], [1, 1, 0.8], [0, Math.PI / 4, 0]),
      ]);
    case 'lamp':
      return mergeGeometries([
        part(cyl(0.07, 0.09, 2.2, 6), '#3d3a40', [0, 1.1, 0]),
        part(box(0.35, 0.4, 0.35), '#ffd77a', [0, 2.35, 0]),
        part(cone(0.3, 0.25, 4), '#3d3a40', [0, 2.67, 0], [1, 1, 1], [0, Math.PI / 4, 0]),
      ]);
    case 'fence':
      return part(box(2, 0.6, 0.1), T, [0, 0.3, 0]);
  }
}

const cache = new Map<PropKind, THREE.BufferGeometry>();
export function propGeometry(kind: PropKind) {
  let g = cache.get(kind);
  if (!g) cache.set(kind, (g = build(kind)));
  return g;
}

export const PROP_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
/** Crystals and lamps glow a little. */
export const GLOW_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.4,
  emissive: '#ffffff',
  emissiveIntensity: 0.25,
});
export const glows = (kind: PropKind) => kind === 'crystal' || kind === 'lamp';
