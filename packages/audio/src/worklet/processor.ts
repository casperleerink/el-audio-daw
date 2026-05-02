import initWasm, { WasmEngine } from "../../pkg/audio_engine.js";
import type { EngineCommand } from "../protocol.js";

declare const sampleRate: number;
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

class DawAudioProcessor extends AudioWorkletProcessor {
  private engine: WasmEngine | null = null;
  private ready = false;
  private playing = false;
  private positionSamples = 0;
  private emitEverySamples = Math.round(sampleRate * 0.05);
  private samplesSinceEmit = 0;
  private meterPeak = 0;
  private meterSquareSum = 0;
  private meterSampleCount = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<EngineCommand>) => this.handleCommand(event.data);
    void this.initializeWasm();
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1];
    if (!left || !right) return true;

    if (this.engine) {
      this.engine.process(left, right);
    } else {
      left.fill(0);
      right.fill(0);
    }

    this.updateMeters(left, right);

    if (this.playing) {
      this.positionSamples += left.length;
      this.samplesSinceEmit += left.length;
      if (this.samplesSinceEmit >= this.emitEverySamples) {
        this.samplesSinceEmit = 0;
        this.port.postMessage({
          type: "Playhead",
          positionSamples: this.positionSamples,
          timeSeconds: this.positionSamples / sampleRate,
        });
        const rms =
          this.meterSampleCount > 0 ? Math.sqrt(this.meterSquareSum / this.meterSampleCount) : 0;
        this.port.postMessage({
          type: "Meters",
          meters: [{ id: "master", peak: this.meterPeak, rms }],
        });
        this.meterPeak = 0;
        this.meterSquareSum = 0;
        this.meterSampleCount = 0;
      }
    }

    return true;
  }

  private async initializeWasm(): Promise<void> {
    try {
      const wasmUrl = new URL("../../pkg/audio_engine_bg.wasm", import.meta.url).href;
      await initWasm(wasmUrl);
      this.engine = new WasmEngine(sampleRate);
      this.ready = true;
      this.port.postMessage({ type: "Ready" });
    } catch (error) {
      this.port.postMessage({
        type: "Error",
        message: error instanceof Error ? error.message : "Failed to initialize WASM audio engine",
      });
    }
  }

  private updateMeters(left: Float32Array, right: Float32Array): void {
    for (let index = 0; index < left.length; index++) {
      const leftSample = left[index] ?? 0;
      const rightSample = right[index] ?? 0;
      this.meterPeak = Math.max(this.meterPeak, Math.abs(leftSample), Math.abs(rightSample));
      this.meterSquareSum += leftSample * leftSample + rightSample * rightSample;
      this.meterSampleCount += 2;
    }
  }

  private handleCommand(command: EngineCommand): void {
    if (command.type === "Initialize") {
      this.emitEverySamples = Math.max(
        1,
        Math.round((sampleRate * command.emitPlayheadIntervalMs) / 1000),
      );
      return;
    }

    if (command.type === "Play") this.playing = true;
    if (command.type === "Pause") this.playing = false;
    if (command.type === "Stop") {
      this.playing = false;
      this.positionSamples = 0;
    }
    if (command.type === "Seek")
      this.positionSamples = Math.max(0, Math.round(command.timeSeconds * sampleRate));

    if (this.ready) this.engine?.apply_command(command);
  }
}

registerProcessor("daw-audio-processor", DawAudioProcessor);
