import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from './rng';

export class Noise {
  private n: NoiseFunction2D;

  constructor(seed: number) {
    this.n = createNoise2D(mulberry32(seed));
  }

  /** Simplex noise in [-1, 1]. */
  at(x: number, y: number) {
    return this.n(x, y);
  }

  /** Fractal noise, roughly in [-1, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
