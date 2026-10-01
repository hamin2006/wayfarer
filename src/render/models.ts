import * as THREE from 'three';
import type { WeaponType } from '../loot/items';
import type { EnemyKind } from '../world/biomes';

export interface AnimState {
  t: number;
  /** 0 idle .. 1 full run. */
  move: number;
  /** Basic attack phase 0..1, or -1. */
  attack: number;
  /** Telegraphed wind-up progress 0..1, or -1. */
  windup: number;
}

export interface Rig {
  root: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  animate(s: AnimState): void;
  setWeapon?(type: WeaponType | 'club' | 'bow' | null, glow?: string | null): void;
  setShirt?(color: string): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

class MatSet {
  list: THREE.MeshStandardMaterial[] = [];
  get(color: string | THREE.Color, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });
    this.list.push(m);
    return m;
  }
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Weapon meshes point along +Y from the grip. */
function weaponMesh(type: WeaponType | 'club' | 'bow', mats: MatSet, glow: string | null) {
  const g = new THREE.Group();
  const steel = mats.get('#d9dde6', { metalness: 0.5, roughness: 0.35, emissive: glow ?? '#000000', emissiveIntensity: glow ? 0.6 : 0 });
  const wood = mats.get('#7a5134');
  const gold = mats.get('#e8b54a', { metalness: 0.5, roughness: 0.4 });
  switch (type) {
    case 'sword':
      g.add(mesh(box(0.05, 0.2, 0.05), wood, 0, 0, 0), mesh(box(0.3, 0.05, 0.07), gold, 0, 0.12, 0), mesh(box(0.08, 0.8, 0.025), steel, 0, 0.54, 0));
      break;
    case 'axe':
      g.add(mesh(box(0.05, 0.95, 0.05), wood, 0, 0.35, 0), mesh(box(0.34, 0.3, 0.04), steel, 0.14, 0.72, 0));
      break;
    case 'hammer':
      g.add(mesh(box(0.06, 0.9, 0.06), wood, 0, 0.35, 0), mesh(box(0.44, 0.24, 0.24), steel, 0, 0.82, 0));
      break;
    case 'dagger':
      g.add(mesh(box(0.05, 0.14, 0.05), wood, 0, 0, 0), mesh(box(0.2, 0.04, 0.06), gold, 0, 0.08, 0), mesh(box(0.06, 0.42, 0.02), steel, 0, 0.32, 0));
      break;
    case 'club':
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.75, 6), wood, 0, 0.3, 0));
      break;
    case 'bow': {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 4, 12, Math.PI), wood);
      arc.rotation.z = -Math.PI / 2;
      g.add(arc);
      break;
    }
  }
  return g;
}

interface HumanoidOpts {
  skin: string;
  shirt: string;
  pants: string;
  hair?: string;
  scale?: number;
  head?: number;
  ears?: boolean;
  bony?: boolean;
  cape?: string;
  eyes?: string;
  weapon?: WeaponType | 'club' | 'bow' | null;
  bulky?: boolean;
}

function humanoid(o: HumanoidOpts): Rig {
  const mats = new MatSet();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(o.scale ?? 1);

  const skin = mats.get(o.skin);
  const shirt = mats.get(o.shirt);
  const pants = mats.get(o.pants);
  const limb = o.bony ? 0.09 : o.bulky ? 0.24 : 0.15;
  const torsoW = o.bony ? 0.34 : o.bulky ? 0.8 : 0.5;

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (o.bulky ? 0.22 : 0.13), 0.62, 0);
    pivot.add(mesh(box(limb + 0.03, 0.62, limb + 0.05), pants, 0, -0.31, 0));
    body.add(pivot);
    return pivot;
  });

  const torso = new THREE.Group();
  torso.position.y = 0.62;
  body.add(torso);
  torso.add(mesh(box(torsoW, 0.58, o.bulky ? 0.5 : 0.3), shirt, 0, 0.3, 0));
  if (!o.bony) torso.add(mesh(box(torsoW + 0.02, 0.07, 0.32), mats.get('#3b2b20'), 0, 0.04, 0));
  if (o.cape) {
    const cape = mesh(box(torsoW - 0.04, 0.62, 0.04), mats.get(o.cape), 0, 0.26, -0.18);
    cape.rotation.x = 0.12;
    torso.add(cape);
  }

  const headSize = 0.36 * (o.head ?? 1);
  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  head.add(mesh(box(headSize, headSize, headSize), skin, 0, headSize / 2, 0));
  if (o.hair) head.add(mesh(box(headSize + 0.03, headSize * 0.32, headSize + 0.03), mats.get(o.hair), 0, headSize * 0.95, -0.01));
  const eyeMat = mats.get(o.eyes ?? '#1e1e24', o.eyes ? { emissive: o.eyes, emissiveIntensity: 1 } : {});
  for (const side of [-1, 1]) head.add(mesh(box(0.06, 0.07, 0.02), eyeMat, side * headSize * 0.22, headSize * 0.55, headSize / 2 + 0.005));
  if (o.ears) {
    for (const side of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.07, 0.26, 4), skin, side * (headSize / 2 + 0.08), headSize * 0.6, 0);
      ear.rotation.z = -side * 1.2;
      head.add(ear);
    }
  }

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW / 2 + limb / 2 + 0.01), 0.52, 0);
    pivot.add(mesh(box(limb, 0.52, limb), side < 0 ? skin : skin, 0, -0.24, 0));
    torso.add(pivot);
    return pivot;
  });
  const hand = new THREE.Group();
  hand.position.set(0, -0.48, 0.02);
  hand.rotation.x = Math.PI / 2;
  arms[1].add(hand);
  const offHand = new THREE.Group();
  offHand.position.set(0, -0.48, 0.05);
  arms[0].add(offHand);

  let weapon: THREE.Object3D | null = null;
  const setWeapon = (type: HumanoidOpts['weapon'], glow: string | null = null) => {
    weapon?.removeFromParent();
    weapon = null;
    if (!type) return;
    weapon = weaponMesh(type, mats, glow);
    (type === 'bow' ? offHand : hand).add(weapon);
  };
  setWeapon(o.weapon);

  return {
    root,
    mats: mats.list,
    setWeapon,
    setShirt: (c) => shirt.color.set(c),
    animate({ t, move, attack, windup }) {
      const ph = t * 11;
      const swing = Math.sin(ph) * move;
      legs[0].rotation.x = swing * 0.75;
      legs[1].rotation.x = -swing * 0.75;
      arms[0].rotation.x = -swing * 0.6;
      arms[1].rotation.x = swing * 0.5;
      arms[0].rotation.z = arms[1].rotation.z = 0;
      body.position.y = Math.abs(Math.sin(ph)) * 0.06 * move + Math.sin(t * 2.4) * 0.008;
      torso.rotation.y = 0;
      torso.rotation.x = move * 0.08;

      if (attack >= 0) {
        // Wind back, slash across, recover.
        const a = attack < 0.3 ? -2.5 * (attack / 0.3) : attack < 0.6 ? -2.5 + 3.4 * ((attack - 0.3) / 0.3) : 0.9 * (1 - (attack - 0.6) / 0.4);
        arms[1].rotation.x = a;
        torso.rotation.y = attack < 0.3 ? 0.5 * (attack / 0.3) : attack < 0.6 ? 0.5 - 1.1 * ((attack - 0.3) / 0.3) : -0.6 * (1 - (attack - 0.6) / 0.4);
      }
      if (windup >= 0) {
        if (o.weapon === 'bow') {
          arms[0].rotation.x = -1.5;
          arms[1].rotation.x = -1.4;
          arms[1].rotation.z = 0.4 * windup;
        } else {
          // Both arms overhead, ready to slam.
          arms[0].rotation.x = arms[1].rotation.x = -2.9 * Math.min(1, windup * 1.3);
          torso.rotation.x = -0.25 * windup;
        }
      }
    },
  };
}

function slime(color: THREE.Color): Rig {
  const mats = new MatSet();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = mats.get(color, { transparent: true, opacity: 0.88, roughness: 0.25 });
  const blob = mesh(new THREE.IcosahedronGeometry(0.55, 1), mat, 0, 0.45, 0);
  blob.scale.set(1, 0.8, 1);
  body.add(blob);
  const eye = mats.get('#1e1e24');
  for (const s of [-1, 1]) body.add(mesh(box(0.09, 0.14, 0.04), eye, s * 0.17, 0.55, 0.48));
  return {
    root,
    mats: mats.list,
    animate({ t, move, attack, windup }) {
      const hop = Math.abs(Math.sin(t * 7)) * move;
      body.position.y = hop * 0.35;
      const squash = 1 + Math.sin(t * 14) * 0.08 * (1 - move) - hop * 0.1;
      body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      body.position.z = 0;
      if (windup >= 0) body.scale.set(1.15 + windup * 0.15, 0.75, 1.15);
      if (attack >= 0) {
        body.position.z = Math.sin(attack * Math.PI) * 0.6;
        body.scale.set(0.9, 1.15, 1.2);
      }
    },
  };
}

function bat(color: THREE.Color): Rig {
  const mats = new MatSet();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = mats.get(color);
  const wing = mats.get(color.clone().multiplyScalar(0.6));
  body.add(mesh(new THREE.IcosahedronGeometry(0.24, 0), fur, 0, 0, 0));
  const eye = mats.get('#ffde59', { emissive: '#ffde59', emissiveIntensity: 1.2 });
  for (const s of [-1, 1]) body.add(mesh(box(0.06, 0.06, 0.03), eye, s * 0.09, 0.06, 0.21));
  const wings = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.x = s * 0.18;
    const w = mesh(box(0.6, 0.04, 0.35), wing, s * 0.3, 0, 0);
    p.add(w);
    body.add(p);
    return p;
  });
  return {
    root,
    mats: mats.list,
    animate({ t, attack }) {
      const flap = Math.sin(t * 22) * 0.9;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      body.position.y = 1.3 + Math.sin(t * 5) * 0.15 - (attack >= 0 ? Math.sin(attack * Math.PI) * 0.6 : 0);
      body.position.z = attack >= 0 ? Math.sin(attack * Math.PI) * 0.4 : 0;
    },
  };
}

function boar(color: THREE.Color): Rig {
  const mats = new MatSet();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hide = mats.get(color);
  const dark = mats.get(color.clone().multiplyScalar(0.55));
  const tusk = mats.get('#f6f0dc');
  body.add(mesh(box(0.8, 0.6, 1.2), hide, 0, 0.7, 0));
  body.add(mesh(box(0.2, 0.15, 1.0), dark, 0, 1.05, -0.05));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.65);
  head.add(mesh(box(0.55, 0.48, 0.5), hide, 0, 0, 0.18), mesh(box(0.32, 0.24, 0.16), dark, 0, -0.06, 0.48));
  for (const s of [-1, 1]) {
    const t = mesh(new THREE.ConeGeometry(0.05, 0.28, 4), tusk, s * 0.2, -0.1, 0.5);
    t.rotation.x = -1.1;
    head.add(t);
    head.add(mesh(box(0.06, 0.06, 0.02), mats.get('#1e1e24'), s * 0.15, 0.08, 0.44));
  }
  body.add(head);
  const legs = [
    [-0.25, 0.4],
    [0.25, 0.4],
    [-0.25, -0.4],
    [0.25, -0.4],
  ].map(([x, z]) => {
    const p = new THREE.Group();
    p.position.set(x, 0.45, z);
    p.add(mesh(box(0.16, 0.45, 0.16), dark, 0, -0.22, 0));
    body.add(p);
    return p;
  });
  return {
    root,
    mats: mats.list,
    animate({ t, move, windup, attack }) {
      const speed = attack >= 0 ? 26 : 13;
      const s = Math.sin(t * speed) * Math.max(move, attack >= 0 ? 1 : 0);
      legs[0].rotation.x = legs[3].rotation.x = s * 0.7;
      legs[1].rotation.x = legs[2].rotation.x = -s * 0.7;
      head.rotation.x = windup >= 0 ? 0.35 * windup : 0;
      body.rotation.x = windup >= 0 ? Math.sin(t * 30) * 0.03 : 0;
      body.position.y = Math.abs(s) * 0.04;
    },
  };
}

const ENEMY_BASE: Record<EnemyKind, string> = {
  slime: '#6ad16a',
  goblin: '#79b84a',
  skeleton: '#e9e3d1',
  boar: '#8a5a3c',
  golem: '#8d8a94',
  bat: '#5a4a6e',
};

export function enemyRig(kind: EnemyKind, tint: string): Rig {
  const c = new THREE.Color(ENEMY_BASE[kind]).lerp(new THREE.Color(tint), kind === 'skeleton' ? 0.15 : 0.4);
  const hex = `#${c.getHexString()}`;
  switch (kind) {
    case 'slime':
      return slime(c);
    case 'bat':
      return bat(c);
    case 'boar':
      return boar(c);
    case 'goblin':
      return humanoid({ skin: hex, shirt: '#7a5a3a', pants: '#4d3b2a', scale: 0.8, head: 1.3, ears: true, weapon: 'club', eyes: '#ffdd55' });
    case 'skeleton':
      return humanoid({ skin: hex, shirt: hex, pants: hex, bony: true, weapon: 'bow', eyes: '#ff4d4d' });
    case 'golem':
      return humanoid({ skin: hex, shirt: hex, pants: `#${c.clone().multiplyScalar(0.8).getHexString()}`, scale: 1.55, bulky: true, head: 0.9, eyes: '#7df9ff' });
  }
}

export function heroRig(): Rig {
  return humanoid({ skin: '#f1c27d', shirt: '#3f7fd9', pants: '#4a3b2a', hair: '#6b3e1f', cape: '#c0392b', weapon: 'sword' });
}
