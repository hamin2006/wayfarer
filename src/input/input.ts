import * as THREE from 'three';
import type { Ability } from '../entities/player';

const JOY_MAX = 56;

/**
 * Keyboard (WASD + Space/Q/E), mouse aim (click = bolt toward cursor), and a floating touch joystick.
 * The camera never rotates, so "up" on screen is always world -Z.
 */
export class Input {
  readonly move = { x: 0, z: 0 };
  readonly aim = new THREE.Vector3();
  aimValid = false;
  touchMode = typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  onAbility: (a: Ability) => void = () => {};
  onKey: (key: string) => void = () => {};
  enabled = true;

  private keys = new Set<string>();
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private joyBase = document.createElement('div');
  private joyKnob = document.createElement('div');
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mouse = { x: 0, y: 0, inside: false };

  constructor(
    canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
  ) {
    this.joyBase.className = 'joy-base';
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    document.body.appendChild(this.joyBase);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if ([' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.keys.add(k);
      this.touchMode = false;
      if (!this.enabled) {
        this.onKey(k);
        return;
      }
      if (k === ' ') this.onAbility('dash');
      else if (k === 'q') this.onAbility('spin');
      else if (k === 'e') this.onAbility('bolt');
      else this.onKey(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touchMode = true;
        if (this.joy.id === -1) {
          this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
          canvas.setPointerCapture(e.pointerId);
          this.joyBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
          this.joyBase.classList.add('show');
          this.drawKnob();
        }
        return;
      }
      this.touchMode = false;
      this.trackMouse(e);
      if (this.enabled && e.button === 0) this.onAbility('bolt');
      else if (this.enabled && e.button === 2) this.onAbility('dash');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) {
        this.joy.x = e.clientX;
        this.joy.y = e.clientY;
        this.drawKnob();
      } else if (e.pointerType === 'mouse') this.trackMouse(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = -1;
      this.joyBase.classList.remove('show');
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.mouse.inside = false;
    });
  }

  private trackMouse(e: PointerEvent) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.inside = true;
  }

  private drawKnob() {
    let dx = this.joy.x - this.joy.ox;
    let dy = this.joy.y - this.joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_MAX) {
      dx = (dx / len) * JOY_MAX;
      dy = (dy / len) * JOY_MAX;
    }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  get joystickActive() {
    return this.joy.id !== -1;
  }

  /** Recompute movement and the mouse aim point (on the plane at `groundY`). */
  update(groundY: number) {
    let x = 0;
    let z = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (this.joy.id !== -1) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        const m = Math.min(1, len / JOY_MAX);
        x = (dx / len) * m;
        z = (dy / len) * m;
      }
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.z = this.enabled ? z : 0;

    this.aimValid = false;
    if (this.mouse.inside && !this.touchMode) {
      this.ndc.set((this.mouse.x / window.innerWidth) * 2 - 1, -(this.mouse.y / window.innerHeight) * 2 + 1);
      this.ray.setFromCamera(this.ndc, this.camera);
      this.plane.constant = -groundY;
      this.aimValid = !!this.ray.ray.intersectPlane(this.plane, this.aim);
    }
  }
}
