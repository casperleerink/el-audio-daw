import { AudioEngineController } from "./controller.js";
import type { ProjectAudioState } from "./project-audio-state.js";
import type { MeterValue as NewMeterValue } from "./protocol.js";

export interface TrackState {
  id: string;
  muted: boolean;
  solo: boolean;
  gain: number;
  pan: number;
}

export interface ClipState {
  id: string;
  trackId: string;
  fileId: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  gain: number;
}

export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";
export interface FilterEffectData {
  type: "filter";
  cutoff: number;
  resonance: number;
  filterType: FilterType;
}
export type EffectData = FilterEffectData;
export interface TrackEffect {
  id: string;
  trackId: string;
  order: number;
  enabled: boolean;
  effectData: EffectData;
}

export interface AudioEngineState {
  tracks: TrackState[];
  clips: ClipState[];
  effects: TrackEffect[];
  masterGain: number;
}

export interface VFSEntry {
  channels: number;
  duration: number;
  sampleRate: number;
}

export interface MeterValue {
  min: number;
  max: number;
}

type PlayheadCallback = (timeInSeconds: number) => void;
type MeterCallback = (meters: Map<string, MeterValue>) => void;

/** Compatibility wrapper for the previous DAW integration, backed by AudioEngineController. */
export class AudioEngine {
  private controller = new AudioEngineController();
  private initialized = false;
  private playing = false;
  private projectSampleRate = 44100;
  private playhead = 0;
  private state: AudioEngineState = { tracks: [], clips: [], effects: [], masterGain: 0 };
  private assets = new Map<string, VFSEntry>();
  private playheadCallbacks = new Set<PlayheadCallback>();
  private meterCallbacks = new Set<MeterCallback>();

  async initialize(sampleRate?: number): Promise<void> {
    if (this.initialized) return;
    this.projectSampleRate = sampleRate ?? 44100;
    const requestedRenderSampleRate = this.projectSampleRate <= 192_000 ? this.projectSampleRate : undefined;
    await this.controller.initialize({ sampleRate: requestedRenderSampleRate });

    this.initialized = true;

    this.controller.onPlayhead((event) => {
      this.playhead = event.timeSeconds;
      for (const callback of this.playheadCallbacks) callback(event.timeSeconds);
    });

    this.controller.onMeters((event) => {
      const meters = new Map<string, MeterValue>();
      for (const meter of event.meters) meters.set(meter.id, toLegacyMeter(meter));
      for (const callback of this.meterCallbacks) callback(meters);
    });

    this.syncProject();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    this.playing = true;
    this.controller.play();
  }

  stop(): void {
    this.playing = false;
    this.controller.pause();
  }

  setPlayhead(timeInSeconds: number): void {
    this.playhead = Math.max(0, timeInSeconds);
    this.controller.seek(this.playhead);
    for (const callback of this.playheadCallbacks) callback(this.playhead);
  }

  getPlayhead(): number {
    return this.playhead;
  }

  onPlayheadUpdate(callback: PlayheadCallback): () => void {
    this.playheadCallbacks.add(callback);
    return () => this.playheadCallbacks.delete(callback);
  }

  onMeterUpdate(callback: MeterCallback): () => void {
    this.meterCallbacks.add(callback);
    return () => this.meterCallbacks.delete(callback);
  }

  setTracks(tracks: TrackState[]): void {
    this.state.tracks = tracks;
    this.syncProject();
  }

  setTrackGain(trackId: string, gainDb: number): void {
    const track = this.state.tracks.find((item) => item.id === trackId);
    if (track) track.gain = gainDb;
    this.controller.setTrackGain(trackId, gainDb);
  }

  setTrackPan(trackId: string, pan: number): void {
    const track = this.state.tracks.find((item) => item.id === trackId);
    if (track) track.pan = pan;
    this.controller.setTrackPan(trackId, pan);
  }

  setClips(clips: ClipState[]): void {
    this.state.clips = clips;
    this.syncProject();
  }

  setEffects(effects: TrackEffect[]): void {
    this.state.effects = effects;
    this.syncProject();
  }

  setMasterGain(gainDb: number): void {
    this.state.masterGain = gainDb;
    this.controller.setMasterGain(gainDb);
    this.syncProject();
  }

  dispose(): void {
    this.controller.dispose();
    this.initialized = false;
    this.playing = false;
    this.playheadCallbacks.clear();
    this.meterCallbacks.clear();
    this.assets.clear();
  }

  async loadAudioIntoVFS(key: string, url: string): Promise<VFSEntry> {
    if (!this.initialized) throw new Error("AudioEngine not initialized");
    if (this.assets.has(key)) return this.assets.get(key)!;
    const decoded = await this.controller.loadAsset({ id: key, url });
    const entry = {
      channels: decoded.channels.length,
      duration: decoded.lengthSamples / decoded.sampleRate,
      sampleRate: decoded.sampleRate,
    };
    this.assets.set(key, entry);
    return entry;
  }

  isAudioLoaded(key: string): boolean {
    return this.assets.has(key);
  }

  getVFSEntry(key: string): VFSEntry | undefined {
    return this.assets.get(key);
  }

  getVFSEntries(): Map<string, VFSEntry> {
    return new Map(this.assets);
  }

  getSampleRate(): number {
    return this.projectSampleRate;
  }

  async pruneVFS(activeKeys: string[]): Promise<void> {
    const activeSet = new Set(activeKeys);
    for (const key of this.assets.keys()) {
      if (!activeSet.has(key)) {
        this.assets.delete(key);
        this.controller.unloadAsset(key);
      }
    }
  }

  private syncProject(): void {
    if (!this.initialized) return;
    this.controller.loadProject(toProjectAudioState(this.state, this.projectSampleRate));
  }
}

function toProjectAudioState(state: AudioEngineState, sampleRate: number): ProjectAudioState {
  const clips = state.clips.map((clip) => ({
    id: clip.id,
    trackId: clip.trackId,
    assetId: clip.fileId,
    startSamples: Math.round(clip.startTime),
    durationSamples: Math.round(clip.duration),
    sourceStartSamples: Math.round(clip.audioStartTime),
    gainDb: clip.gain,
  }));

  return {
    projectId: "legacy-project",
    sampleRate,
    tracks: state.tracks.map((track, order) => ({
      id: track.id,
      kind: "audio",
      order,
      muted: track.muted,
      solo: track.solo,
      gainDb: track.gain,
      pan: track.pan,
    })),
    clips,
    effects: [],
    master: { gainDb: state.masterGain },
  };
}

function toLegacyMeter(meter: NewMeterValue): MeterValue {
  return { min: -meter.peak, max: meter.peak };
}
