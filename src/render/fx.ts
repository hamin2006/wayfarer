import * as THREE from 'three';

const MAX_PARTICLES = 600;

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  gravity: number;
}

/** Pooled cube particles in a single instanced mesh. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private ps: (Particle | null)[] = new Array(MAX_PARTICLES).fill(null);
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.c.set('#ffffff'));
    }
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, color: string, count: number, speed = 4, size = 0.14, gravity = 12, life = 0.6) {
    this.c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.2 + 0.2, Math.random() * 2 - 1).normalize();
      this.ps[i] = {
        pos: at.clone(),
        vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        gravity,
      };
      this.mesh.setColorAt(i, this.c);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.ps[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.ps[i] = null;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.min(1, p.life / p.max);
      this.q.setFromEuler(new THREE.Euler(p.life * 9, p.life * 7, 0));
      this.mesh.setMatrixAt(i, this.m.compose(p.pos, this.q, this.s.setScalar(p.size * k)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface Telegraph {
  group: THREE.Object3D;
  t: number;
  dur: number;
  fill: THREE.Object3D;
  done: boolean;
}

const tgMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.22, depthWrite: false });
const tgEdge = new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.75, depthWrite: false });
const disc = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const ring = new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2);
const rect = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);

/** Red ground warnings that fill up before a heavy attack lands. */
export class Telegraphs {
  private list: Telegraph[] = [];
  constructor(private scene: THREE.Scene) {}

  circle(at: THREE.Vector3, radius: number, dur: number): Telegraph {
    const group = new THREE.Group();
    group.position.copy(at).setY(at.y + 0.06);
    const edge = new THREE.Mesh(ring, tgEdge);
    edge.scale.setScalar(radius);
    const fill = new THREE.Mesh(disc, tgMat);
    fill.scale.setScalar(0.01);
    group.add(edge, fill);
    fill.userData.max = radius;
    return this.add(group, fill, dur);
  }

  line(from: THREE.Vector3, angle: number, length: number, width: number, dur: number): Telegraph {
    const group = new THREE.Group();
    group.position.copy(from).setY(from.y + 0.06);
    group.rotation.y = angle;
    const edge = new THREE.Mesh(rect, tgMat);
    edge.scale.set(width, 1, length);
    const fill = new THREE.Mesh(rect, tgEdge);
    fill.scale.set(width, 1, 0.01);
    fill.userData.max = length;
    fill.userData.line = true;
    group.add(edge, fill);
    return this.add(group, fill, dur);
  }

  private add(group: THREE.Object3D, fill: THREE.Object3D, dur: number) {
    this.scene.add(group);
    const tg = { group, fill, t: 0, dur, done: false };
    this.list.push(tg);
    return tg;
  }

  remove(tg: Telegraph) {
    tg.done = true;
  }

  update(dt: number) {
    this.list = this.list.filter((tg) => {
      tg.t += dt;
      const k = Math.min(1, tg.t / tg.dur);
      if (tg.fill.userData.line) tg.fill.scale.z = Math.max(0.01, k * tg.fill.userData.max);
      else tg.fill.scale.setScalar(Math.max(0.01, k * tg.fill.userData.max));
      if (tg.done || tg.t > tg.dur + 0.05) {
        tg.group.removeFromParent();
        return false;
      }
      return true;
    });
  }
}

interface FloatItem {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
  rise: number;
}

/** Damage numbers and short floating text projected from world space. */
export class FloatText {
  private root = document.createElement('div');
  private items: FloatItem[] = [];
  private v = new THREE.Vector3();

  constructor(private camera: THREE.Camera) {
    this.root.className = 'float-layer';
    document.body.appendChild(this.root);
  }

  spawn(at: THREE.Vector3, text: string, cls: string, life = 0.85) {
    if (this.items.length > 60) this.items.shift()!.el.remove();
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    this.items.push({ el, pos: at.clone().add(jitter), t: 0, life, rise: cls.includes('big') ? 1.6 : 1.1 });
  }

  update(dt: number) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.items = this.items.filter((it) => {
      it.t += dt;
      if (it.t >= it.life) {
        it.el.remove();
        return false;
      }
      const k = it.t / it.life;
      this.v.copy(it.pos).setY(it.pos.y + k * it.rise).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      it.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      return true;
    });
  }
}
