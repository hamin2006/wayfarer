import * as THREE from 'three';
import { WATER_Y } from '../config';

const SKY = {
  day: new THREE.Color('#9fd8ff'),
  dusk: new THREE.Color('#ffb38a'),
  night: new THREE.Color('#1c2547'),
};

/** Renderer, lights, sky colour, water and the day/night cycle. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 1, 260);
  private sun = new THREE.DirectionalLight('#fff3dd', 2.4);
  private hemi = new THREE.HemisphereLight('#e2f3ff', '#6d8a5a', 1.5);
  private water: THREE.Mesh;
  private sky = new THREE.Color();
  private fog: THREE.Fog;
  /** 0..1 night amount, for UI tinting. */
  night = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.fog = new THREE.Fog('#9fd8ff', 58, 115);
    this.scene.fog = this.fog;
    this.scene.background = this.sky;
    this.scene.add(this.hemi);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -32;
    cam.right = cam.top = 32;
    cam.near = 1;
    cam.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#4fb3e8', transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1 }),
    );
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 50 : 34;
    this.camera.updateProjectionMatrix();
  }

  /** `dayTime` in [0,1): 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight. */
  update(focus: THREE.Vector3, dayTime: number, t: number) {
    const sunAngle = dayTime * Math.PI * 2;
    const height = Math.sin(sunAngle); // >0 day
    const dayAmt = THREE.MathUtils.smoothstep(height, -0.25, 0.3);
    const duskAmt = Math.max(0, 1 - Math.abs(height) * 3.5) * 0.9;
    this.night = 1 - dayAmt;

    this.sky.copy(SKY.night).lerp(SKY.day, dayAmt).lerp(SKY.dusk, duskAmt * 0.6);
    this.fog.color.copy(this.sky);
    this.sun.intensity = 0.35 + 2.2 * dayAmt;
    this.sun.color.set('#fff3dd').lerp(SKY.dusk, duskAmt);
    this.hemi.intensity = 0.75 + 0.85 * dayAmt;
    this.hemi.color.set('#e2f3ff').lerp(new THREE.Color('#7f8fff'), 1 - dayAmt);

    // Keep the sun high enough for readable shadows; at night it doubles as moonlight.
    const elev = 0.55 + 0.35 * Math.abs(height);
    const dir = new THREE.Vector3(Math.cos(sunAngle) * 0.8 + 0.3, elev, 0.45).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 50);
    this.sun.target.position.copy(focus);

    this.water.position.x = Math.round(focus.x / 10) * 10;
    this.water.position.z = Math.round(focus.z / 10) * 10;
    this.water.position.y = WATER_Y + Math.sin(t * 0.8) * 0.04;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
