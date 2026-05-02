import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWav } from "./wav.ts";

const SAMPLE_RATE = 44100;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "seed", "assets");

function sineBass(durationSec: number, freq: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t * 20) * Math.min(1, (durationSec - t) * 4);
    out[i] = Math.sin(2 * Math.PI * freq * t) * 0.6 * env;
  }
  return out;
}

function kick(durationSec: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const pitch = 120 * Math.exp(-t * 18) + 45;
    const env = Math.exp(-t * 8);
    out[i] = Math.sin(2 * Math.PI * pitch * t) * env * 0.9;
  }
  return out;
}

function noiseHat(durationSec: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 35);
    const white = Math.random() * 2 - 1;
    const hp = white - prev * 0.5;
    prev = white;
    out[i] = hp * env * 0.5;
  }
  return out;
}

const assets: { name: string; samples: Float32Array }[] = [
  { name: "bass-sine.wav", samples: sineBass(2.0, 110) },
  { name: "kick.wav", samples: kick(0.6) },
  { name: "hat.wav", samples: noiseHat(0.3) },
];

mkdirSync(ASSETS_DIR, { recursive: true });

for (const { name, samples } of assets) {
  const wav = encodeWav(samples, SAMPLE_RATE, 1);
  const path = join(ASSETS_DIR, name);
  writeFileSync(path, wav);
  console.log(`wrote ${path} (${wav.length} bytes)`);
}
