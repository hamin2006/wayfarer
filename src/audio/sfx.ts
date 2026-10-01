/** Synthesized sound effects (WebAudio). No audio files needed. */
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private last = new Map<string, number>();
  muted = false;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let k = 0; k < len; k++) data[k] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Rate-limits a sound so swarms of events don't clip. */
  private gate(name: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < ms) return false;
    this.last.set(name, now);
    return true;
  }

  private ready() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return undefined;
    return this.ctx;
  }

  private tone(freq: number, end: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, q: number, gain: number, delay = 0, sweepTo?: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private arp(notes: number[], step: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    notes.forEach((n, k) => this.tone(n, n, dur, type, gain, delay + k * step));
  }

  swing(weapon: string) {
    const heavy = weapon === 'hammer' || weapon === 'axe';
    this.noise(heavy ? 0.16 : 0.1, heavy ? 900 : 1800, 1.2, 0.18, 0, heavy ? 300 : 700);
  }

  hit(crit: boolean) {
    if (!this.gate('hit', 35)) return;
    this.noise(0.07, 1200, 1, crit ? 0.5 : 0.32);
    this.tone(crit ? 220 : 160, 70, 0.1, 'square', crit ? 0.22 : 0.12);
    if (crit) this.tone(1600, 900, 0.08, 'triangle', 0.12);
  }

  kill(boss: boolean) {
    if (!this.gate('kill', 50)) return;
    this.noise(boss ? 0.8 : 0.25, boss ? 300 : 700, 0.8, boss ? 0.6 : 0.3, 0, 120);
    this.tone(boss ? 140 : 300, boss ? 40 : 90, boss ? 0.8 : 0.2, 'sawtooth', boss ? 0.25 : 0.1);
  }

  hurt() {
    if (!this.gate('hurt', 80)) return;
    this.tone(200, 90, 0.18, 'sawtooth', 0.22);
    this.noise(0.12, 500, 1, 0.25);
  }

  dash() {
    this.noise(0.22, 600, 0.8, 0.3, 0, 3000);
  }

  spin() {
    this.noise(0.35, 500, 1.5, 0.35, 0, 2400);
    this.tone(300, 600, 0.3, 'triangle', 0.08);
  }

  bolt() {
    this.tone(900, 1800, 0.12, 'sine', 0.18);
    this.tone(1400, 2600, 0.15, 'triangle', 0.08, 0.02);
  }

  arrow() {
    if (!this.gate('arrow', 60)) return;
    this.noise(0.12, 2500, 3, 0.12, 0, 1200);
  }

  enemySwing() {
    if (!this.gate('eswing', 60)) return;
    this.noise(0.09, 1100, 1.4, 0.12, 0, 500);
  }

  charge() {
    this.noise(0.5, 200, 1, 0.3, 0, 900);
  }

  slam() {
    if (!this.gate('slam', 80)) return;
    this.tone(90, 35, 0.45, 'sine', 0.55);
    this.noise(0.35, 300, 0.7, 0.4, 0, 80, 'lowpass');
  }

  coin() {
    if (!this.gate('coin', 40)) return;
    this.tone(1900, 1900, 0.06, 'square', 0.06);
    this.tone(2500, 2500, 0.12, 'square', 0.06, 0.05);
  }

  orb() {
    this.arp([660, 880, 1100], 0.05, 0.15, 'sine', 0.15);
  }

  pickup(rarity: number) {
    const base = [600, 700, 800, 900, 1000][rarity];
    this.arp([base, base * 1.25, base * 1.5].slice(0, 2 + Math.min(1, rarity)), 0.06, 0.15, 'triangle', 0.14);
  }

  rareDrop(rarity: number) {
    this.arp(rarity >= 4 ? [523, 659, 784, 1047, 1319, 1568] : [587, 740, 880, 1175], 0.07, 0.35, 'triangle', 0.16);
  }

  levelUp() {
    this.arp([523, 659, 784, 1047], 0.09, 0.35, 'square', 0.1);
    this.arp([1047, 1319, 1568], 0.09, 0.5, 'triangle', 0.12, 0.36);
  }

  chest() {
    this.tone(220, 330, 0.25, 'triangle', 0.2);
    this.arp([784, 988, 1175, 1568], 0.06, 0.3, 'sine', 0.14, 0.15);
  }

  shrine() {
    this.arp([392, 494, 587, 784, 988], 0.08, 0.6, 'sine', 0.13);
  }

  boss() {
    this.tone(110, 55, 1.2, 'sawtooth', 0.22);
    this.noise(1, 200, 0.6, 0.3, 0, 60, 'lowpass');
  }

  death() {
    this.arp([392, 330, 262, 196], 0.18, 0.5, 'triangle', 0.18);
  }

  recall() {
    this.arp([523, 784, 1047, 1568], 0.12, 0.5, 'sine', 0.12);
  }

  click() {
    this.tone(900, 700, 0.04, 'triangle', 0.12);
  }
}
