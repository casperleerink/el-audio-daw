export type AudioWorkletModuleUrls = {
  wasmJsUrl: string;
  wasmUrl: string;
};

export async function createAudioWorkletModuleUrl(urls: AudioWorkletModuleUrls): Promise<string> {
  const source = await createAudioWorkletModuleSource(urls);
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

export async function createAudioWorkletModuleSource({
  wasmJsUrl,
  wasmUrl,
}: AudioWorkletModuleUrls): Promise<string> {
  const response = await fetch(wasmJsUrl);
  if (!response.ok) throw new Error(`Failed to fetch WASM glue: ${response.statusText}`);
  const wasmGlue = toInlineWasmGlue(await response.text());
  return `${wasmGlue}\n${createProcessorSource(wasmUrl)}`;
}

function toInlineWasmGlue(source: string): string {
  return source
    .replace("export class WasmEngine", "class WasmEngine")
    .replace("export function initSync", "function initSync")
    .replace("export default function __wbg_init", "async function __wbg_init")
    .replace(
      "module_or_path = new URL('audio_engine_bg.wasm', import.meta.url);",
      "throw new Error('WASM URL is required');",
    )
    .replace("export { initSync, __wbg_init as default };", "");
}

function createProcessorSource(wasmUrl: string): string {
  return `
class DawAudioProcessor extends AudioWorkletProcessor {
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
      await __wbg_init(${JSON.stringify(wasmUrl)});
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

registerProcessor("daw-audio-processor", DawAudioProcessor);
`;
}
