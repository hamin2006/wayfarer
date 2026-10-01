import * as THREE from 'three';

// A longer lens from further back keeps the low-poly shapes from bending at the screen edges.
const OFFSET = new THREE.Vector3(0, 21, 14.5);

/** Angled top-down follow camera with screen shake. Fixed yaw so controls stay screen-relative. */
export class FollowCam {
  zoom = 1;
  private target = new THREE.Vector3();
  private trauma = 0;
  private initialized = false;

  constructor(private camera: THREE.PerspectiveCamera) {
    window.addEventListener(
      'wheel',
      (e) => {
        if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
        this.zoom = THREE.MathUtils.clamp(this.zoom * Math.pow(1.0012, e.deltaY), 0.6, 1.5);
      },
      { passive: true },
    );
  }

  shake(amount: number) {
    this.trauma = Math.min(1, Math.max(this.trauma, amount));
  }

  snap(pos: THREE.Vector3) {
    this.target.copy(pos);
    this.initialized = true;
  }

  update(dt: number, focus: THREE.Vector3, t: number) {
    if (!this.initialized) this.snap(focus);
    this.target.lerp(focus, 1 - Math.exp(-dt * 7));
    const portrait = window.innerWidth < window.innerHeight;
    const off = OFFSET.clone().multiplyScalar(this.zoom * (portrait ? 1.15 : 1));
    this.camera.position.copy(this.target).add(off);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * 0.6;
    if (s > 0) {
      this.camera.position.x += Math.sin(t * 67) * s;
      this.camera.position.y += Math.sin(t * 53 + 1) * s * 0.5;
      this.camera.position.z += Math.sin(t * 71 + 2) * s;
    }
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z);
  }
}
