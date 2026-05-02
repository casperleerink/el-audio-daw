import { decodeAudioAsset } from "./assets.js";

import type { ProjectAudioState, ProjectAudioUpdate } from "./project-audio-state.js";
import type {
  AudioAssetSource,
  AudioEngineError,
  AudioEngineOptions,
  EngineCommand,
  EngineEvent,
  MeterEvent,
  PlayheadEvent,
} from "./protocol.js";

type Listener<T> = (event: T) => void;

export class AudioEngineController {
  private audioContext: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private playheadListeners = new Set<Listener<PlayheadEvent>>();
  private meterListeners = new Set<Listener<MeterEvent>>();
  private errorListeners = new Set<Listener<AudioEngineError>>();

  async initialize(options: AudioEngineOptions = {}): Promise<void> {
    if (this.audioContext && this.node) return;

    const audioContext = new AudioContext(
      options.sampleRate ? { sampleRate: options.sampleRate } : undefined,
    );

    await audioContext.audioWorklet.addModule(
      new URL("./worklet/processor.generated.js", import.meta.url),
    );

    const node = new AudioWorkletNode(audioContext, "daw-audio-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    node.port.onmessage = (event: MessageEvent<EngineEvent>) => this.handleEvent(event.data);
    node.connect(audioContext.destination);

    this.audioContext = audioContext;
    this.node = node;
    this.post({
      type: "Initialize",
      sampleRate: audioContext.sampleRate,
      emitPlayheadIntervalMs: options.emitPlayheadIntervalMs ?? 50,
    });
  }

  dispose(): void {
    this.node?.disconnect();
    this.node?.port.close();
    void this.audioContext?.close();
    this.node = null;
    this.audioContext = null;
    this.playheadListeners.clear();
    this.meterListeners.clear();
    this.errorListeners.clear();
  }

  loadProject(project: ProjectAudioState): void {
    this.post({ type: "LoadProject", project });
  }

  applyProjectUpdate(update: ProjectAudioUpdate): void {
    this.post({ type: "ApplyProjectUpdate", update });
  }

  async loadAsset(asset: AudioAssetSource) {
    if (!this.audioContext) throw new Error("AudioEngineController not initialized");
    const decoded = await decodeAudioAsset(this.audioContext, asset);
    this.post(
      { type: "LoadAsset", asset: decoded },
      decoded.channels.map((channel) => channel.buffer),
    );
    return decoded;
  }

  unloadAsset(assetId: string): void {
    this.post({ type: "UnloadAsset", assetId });
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 44_100;
  }

  play(): void {
    void this.audioContext?.resume();
    this.post({ type: "Play" });
  }

  pause(): void {
    this.post({ type: "Pause" });
  }

  stop(): void {
    this.post({ type: "Stop" });
  }

  seek(timeSeconds: number): void {
    this.post({ type: "Seek", timeSeconds });
  }

  setTrackGain(trackId: string, gainDb: number): void {
    this.post({ type: "SetTrackGain", trackId, gainDb });
  }

  setTrackPan(trackId: string, pan: number): void {
    this.post({ type: "SetTrackPan", trackId, pan });
  }

  setMasterGain(gainDb: number): void {
    this.post({ type: "SetMasterGain", gainDb });
  }

  onPlayhead(callback: Listener<PlayheadEvent>): () => void {
    return this.subscribe(this.playheadListeners, callback);
  }

  onMeters(callback: Listener<MeterEvent>): () => void {
    return this.subscribe(this.meterListeners, callback);
  }

  onError(callback: Listener<AudioEngineError>): () => void {
    return this.subscribe(this.errorListeners, callback);
  }

  private post(command: EngineCommand, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(command, transfer);
  }

  private handleEvent(event: EngineEvent): void {
    if (event.type === "Playhead") this.playheadListeners.forEach((listener) => listener(event));
    if (event.type === "Meters") {
      this.meterListeners.forEach((listener) => listener(event));
    }
    if (event.type === "Error") this.errorListeners.forEach((listener) => listener(event));
  }

  private subscribe<T>(listeners: Set<Listener<T>>, callback: Listener<T>): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
}
