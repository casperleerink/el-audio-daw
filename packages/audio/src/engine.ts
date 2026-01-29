import { el, type NodeRepr_t } from "@elemaudio/core";
import WebRenderer from "@elemaudio/web-renderer";
import { dbToGain } from "./utils.js";

export interface TrackState {
  id: string;
  muted: boolean;
  solo: boolean;
  gain: number; // in dB, -60 to +12
}

export interface AudioEngineState {
  tracks: TrackState[];
  masterGain: number; // in dB, -60 to +12
}

/**
 * VFS entry representing an audio buffer loaded into the Virtual File System
 * Keyed by the Convex storage ID
 */
export interface VFSEntry {
  /** Number of channels in the audio (1 = mono, 2 = stereo) */
  channels: number;
  /** Duration in samples */
  duration: number;
  /** Sample rate of the audio file */
  sampleRate: number;
}

type PlayheadCallback = (timeInSeconds: number) => void;

export class AudioEngine {
  private core: WebRenderer;
  private ctx: AudioContext | null = null;
  private initialized = false;
  private playing = false;
  private playheadPosition = 0; // in seconds
  private playStartTime = 0; // AudioContext time when play started
  private playheadCallbacks: Set<PlayheadCallback> = new Set();
  private animationFrameId: number | null = null;
  private state: AudioEngineState = {
    tracks: [],
    masterGain: 0,
  };
  /** Map of VFS keys (Convex storage IDs) to metadata about loaded audio */
  private vfsEntries: Map<string, VFSEntry> = new Map();

  constructor() {
    this.core = new WebRenderer();
  }

  /**
   * Initializes the audio engine. Must be called after a user gesture.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.ctx = new AudioContext();

    await this.core.initialize(this.ctx, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
    });

    this.initialized = true;
    this.renderGraph();
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if playback is active
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Start playback from the current playhead position
   */
  play(): void {
    if (!this.initialized || !this.ctx || this.playing) {
      return;
    }

    // Resume AudioContext if it's suspended (browser autoplay policy)
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    this.playing = true;
    this.playStartTime = this.ctx.currentTime - this.playheadPosition;
    this.startPlayheadUpdates();
  }

  /**
   * Stop playback, keeping playhead at current position
   */
  stop(): void {
    if (!this.playing) {
      return;
    }

    this.playing = false;
    this.stopPlayheadUpdates();
    // Playhead stays at current position
  }

  /**
   * Set playhead position in seconds
   */
  setPlayhead(timeInSeconds: number): void {
    this.playheadPosition = Math.max(0, timeInSeconds);

    if (this.playing && this.ctx) {
      // Adjust play start time to maintain continuity
      this.playStartTime = this.ctx.currentTime - this.playheadPosition;
    }

    // Notify listeners of the new position
    this.notifyPlayheadListeners();
  }

  /**
   * Get current playhead position in seconds
   */
  getPlayhead(): number {
    if (this.playing && this.ctx) {
      return this.ctx.currentTime - this.playStartTime;
    }
    return this.playheadPosition;
  }

  /**
   * Subscribe to playhead position updates
   */
  onPlayheadUpdate(callback: PlayheadCallback): () => void {
    this.playheadCallbacks.add(callback);
    return () => {
      this.playheadCallbacks.delete(callback);
    };
  }

  /**
   * Update track states
   */
  setTracks(tracks: TrackState[]): void {
    this.state.tracks = tracks;
    this.renderGraph();
  }

  /**
   * Update master gain
   */
  setMasterGain(gainDb: number): void {
    this.state.masterGain = gainDb;
    this.renderGraph();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopPlayheadUpdates();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
    this.playing = false;
    this.playheadCallbacks.clear();
    this.vfsEntries.clear();
  }

  // ==================== VFS Methods ====================

  /**
   * Load an audio file from a URL into the Virtual File System (FR-15, FR-16, FR-18)
   * @param key - The VFS key (Convex storage ID)
   * @param url - The URL to fetch the audio from
   * @returns Metadata about the loaded audio
   */
  async loadAudioIntoVFS(key: string, url: string): Promise<VFSEntry> {
    if (!this.ctx) {
      throw new Error("AudioEngine not initialized");
    }

    // Check if already loaded
    const existing = this.vfsEntries.get(key);
    if (existing) {
      return existing;
    }

    // Fetch and decode the audio file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

    // Add to VFS based on channel count
    const vfsMap: Record<string, Float32Array> = {};
    if (audioBuffer.numberOfChannels === 1) {
      // Mono: use key directly
      vfsMap[key] = audioBuffer.getChannelData(0);
    } else {
      // Stereo or multi-channel: use key:channel format
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        vfsMap[`${key}:${i}`] = audioBuffer.getChannelData(i);
      }
    }

    await this.core.updateVirtualFileSystem(vfsMap);

    // Store metadata
    const entry: VFSEntry = {
      channels: audioBuffer.numberOfChannels,
      duration: audioBuffer.length,
      sampleRate: audioBuffer.sampleRate,
    };
    this.vfsEntries.set(key, entry);

    return entry;
  }

  /**
   * Check if an audio file is loaded in the VFS
   * @param key - The VFS key (Convex storage ID)
   */
  isAudioLoaded(key: string): boolean {
    return this.vfsEntries.has(key);
  }

  /**
   * Get metadata for a loaded audio file
   * @param key - The VFS key (Convex storage ID)
   */
  getVFSEntry(key: string): VFSEntry | undefined {
    return this.vfsEntries.get(key);
  }

  /**
   * Get all loaded VFS entries
   */
  getVFSEntries(): Map<string, VFSEntry> {
    return new Map(this.vfsEntries);
  }

  /**
   * Get the sample rate of the AudioContext
   */
  getSampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  /**
   * Remove unused audio files from the VFS
   * Removes entries not in the provided list of keys
   * @param activeKeys - List of keys that should remain in VFS
   */
  async pruneVFS(activeKeys: string[]): Promise<void> {
    const activeSet = new Set(activeKeys);

    // Remove entries not in active set from our tracking
    for (const key of this.vfsEntries.keys()) {
      if (!activeSet.has(key)) {
        this.vfsEntries.delete(key);
      }
    }

    // Tell Elementary to clean up unused resources
    await this.core.pruneVirtualFileSystem();
  }

  private startPlayheadUpdates(): void {
    const update = () => {
      if (!this.playing) return;

      this.playheadPosition = this.getPlayhead();
      this.notifyPlayheadListeners();
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private stopPlayheadUpdates(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private notifyPlayheadListeners(): void {
    const currentTime = this.getPlayhead();
    for (const callback of this.playheadCallbacks) {
      callback(currentTime);
    }
  }

  /**
   * Render the audio graph based on current state
   *
   * Graph structure:
   * Track 1 (gain) ──┐
   * Track 2 (gain) ──┼──> Sum ──> Master Gain ──> Output
   * Track 3 (gain) ──┘
   */
  private renderGraph(): void {
    if (!this.initialized) {
      return;
    }

    const { tracks, masterGain } = this.state;

    // Determine if any track is soloed
    const anySoloed = tracks.some((t) => t.solo);

    // Build track signals
    // In v1, tracks produce silence (no clips yet), but routing must work
    const trackSignals: NodeRepr_t[] = tracks.map((track) => {
      // Determine if this track should be audible
      const shouldPlay = anySoloed ? track.solo : !track.muted;

      // Get gain value (0 if muted/not-soloed, otherwise convert from dB)
      const gainValue = shouldPlay ? dbToGain(track.gain) : 0;

      // Create a silent signal for this track (placeholder for future clips)
      // Using el.const with a unique key per track for efficient updates
      const silentSignal = el.const({ key: `track-${track.id}-signal`, value: 0 });

      // Apply gain (smooth it to avoid clicks)
      return el.mul(
        el.sm(el.const({ key: `track-${track.id}-gain`, value: gainValue })),
        silentSignal,
      );
    });

    // Sum all tracks (or silence if no tracks)
    let summedSignal: NodeRepr_t;
    const firstTrack = trackSignals[0];
    if (trackSignals.length === 0 || firstTrack === undefined) {
      summedSignal = el.const({ key: "sum-empty", value: 0 });
    } else if (trackSignals.length === 1) {
      summedSignal = firstTrack;
    } else {
      summedSignal = el.add(...trackSignals);
    }

    // Apply master gain with smoothing
    const masterGainValue = dbToGain(masterGain);
    const masterOutput = el.mul(
      el.sm(el.const({ key: "master-gain", value: masterGainValue })),
      summedSignal,
    );

    // Render stereo output (same signal on both channels for now)
    this.core.render(masterOutput, masterOutput);
  }
}
