import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBytes = await readFile(resolve(root, "pkg/audio_engine_bg.wasm"));
let glue = await readFile(resolve(root, "pkg/audio_engine.js"), "utf8");

glue = glue
  .replace("export class WasmEngine", "class WasmEngine")
  .replace("export function initSync", "function initSync")
  .replace("export default function __wbg_init", "async function __wbg_init")
  .replace("export { initSync, __wbg_init as default };", "")
  .replace(
    "module_or_path = new URL('audio_engine_bg.wasm', import.meta.url);",
    "throw new Error('WASM bytes must be provided explicitly');",
  );

const source = `${polyfills()}\nconst WASM_BYTES = new Uint8Array([${Array.from(wasmBytes).join(",")}]);\n${glue}\n${processor()}`;
await writeFile(resolve(root, "src/worklet/processor.generated.js"), source);

function polyfills() {
  return String.raw`const TextDecoder = globalThis.TextDecoder ?? class {
  decode(input) {
    if (!input) return "";
    let output = "";
    for (let index = 0; index < input.length;) {
      const byte1 = input[index++];
      if (byte1 < 0x80) output += String.fromCharCode(byte1);
      else if (byte1 < 0xe0) output += String.fromCharCode(((byte1 & 0x1f) << 6) | (input[index++] & 0x3f));
      else if (byte1 < 0xf0) output += String.fromCharCode(((byte1 & 0x0f) << 12) | ((input[index++] & 0x3f) << 6) | (input[index++] & 0x3f));
      else {
        const b2 = input[index++] & 0x3f;
        const b3 = input[index++] & 0x3f;
        const b4 = input[index++] & 0x3f;
        output += String.fromCodePoint(((byte1 & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4);
      }
    }
    return output;
  }
};

const TextEncoder = globalThis.TextEncoder ?? class {
  encode(input) {
    const bytes = [];
    for (const char of input) {
      const codePoint = char.codePointAt(0);
      if (codePoint < 0x80) bytes.push(codePoint);
      else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
    return new Uint8Array(bytes);
  }

  encodeInto(input, view) {
    const bytes = this.encode(input);
    view.set(bytes);
    return { read: input.length, written: bytes.length };
  }
};`;
}

function processor() {
  return String.raw`class DawAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.ready = false;
    this.pendingCommands = [];
    this.playing = false;
    this.positionSamples = 0;
    this.emitEverySamples = Math.round(sampleRate * 0.05);
    this.samplesSinceEmit = 0;
    this.meterPeak = 0;
    this.meterSquareSum = 0;
    this.meterSampleCount = 0;
    this.port.onmessage = (event) => this.handleCommand(event.data);
    this.initializeWasm();
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1];
    if (!left || !right) return true;

    if (this.engine) this.engine.process(left, right);
    else {
      left.fill(0);
      right.fill(0);
    }

    this.updateMeters(left, right);
    if (this.playing) this.emitTransportEvents(left.length);
    return true;
  }

  async initializeWasm() {
    try {
      await __wbg_init({ module_or_path: WASM_BYTES });
      this.engine = new WasmEngine(sampleRate);
      this.ready = true;
      for (const command of this.pendingCommands) this.engine.apply_command(command);
      this.pendingCommands = [];
      this.port.postMessage({ type: "Ready" });
    } catch (error) {
      this.port.postMessage({
        type: "Error",
        message: error instanceof Error ? error.message : "Failed to initialize WASM audio engine",
      });
    }
  }

  handleCommand(command) {
    if (command.type === "Initialize") {
      this.emitEverySamples = Math.max(1, Math.round((sampleRate * command.emitPlayheadIntervalMs) / 1000));
      return;
    }

    if (command.type === "Play") this.playing = true;
    if (command.type === "Pause") this.playing = false;
    if (command.type === "Stop") {
      this.playing = false;
      this.positionSamples = 0;
    }
    if (command.type === "Seek") this.positionSamples = Math.max(0, Math.round(command.timeSeconds * sampleRate));

    if (this.ready) this.engine?.apply_command(command);
    else this.pendingCommands.push(command);
  }

  updateMeters(left, right) {
    for (let index = 0; index < left.length; index++) {
      const leftSample = left[index] ?? 0;
      const rightSample = right[index] ?? 0;
      this.meterPeak = Math.max(this.meterPeak, Math.abs(leftSample), Math.abs(rightSample));
      this.meterSquareSum += leftSample * leftSample + rightSample * rightSample;
      this.meterSampleCount += 2;
    }
  }

  emitTransportEvents(renderedSamples) {
    this.positionSamples += renderedSamples;
    this.samplesSinceEmit += renderedSamples;
    if (this.samplesSinceEmit < this.emitEverySamples) return;

    this.samplesSinceEmit = 0;
    this.port.postMessage({
      type: "Playhead",
      positionSamples: this.positionSamples,
      timeSeconds: this.positionSamples / sampleRate,
    });
    const rms = this.meterSampleCount > 0 ? Math.sqrt(this.meterSquareSum / this.meterSampleCount) : 0;
    this.port.postMessage({
      type: "Meters",
      meters: [{ id: "master", peak: this.meterPeak, rms }],
    });
    this.meterPeak = 0;
    this.meterSquareSum = 0;
    this.meterSampleCount = 0;
  }
}

registerProcessor("daw-audio-processor", DawAudioProcessor);`;
}
