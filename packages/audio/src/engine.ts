import { el, type NodeRepr_t } from "@elemaudio/core";
import WebRenderer from "@elemaudio/web-renderer";
import { dbToGain } from "./utils.js";

export interface TrackState {
  id: string;
  muted: boolean;
  solo: boolean;
  gain: number; // in dB, -60 to +12
}

/**
 * Clip state for audio playback (FR-19 through FR-23)
 */
export interface ClipState {
  id: string;
  trackId: string;
  /** VFS key (Convex storage ID) for the audio file */
  fileId: string;
  /** Position on timeline in samples */
  startTime: number;
  /** Clip length in samples */
  duration: number;
  /** Offset into source audio in samples (for trimming) */
  audioStartTime: number;
  /** Clip gain in dB */
  gain: number;
}

export interface AudioEngineState {
  tracks: TrackState[];
  clips: ClipState[];
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
    clips: [],
    masterGain: 0,
  };
  /** Map of VFS keys (Convex storage IDs) to metadata about loaded audio */
  private vfsEntries: Map<string, VFSEntry> = new Map();
  /** Offset to convert el.time() to transport time (set when play starts) */
  private transportTimeOffset = 0;

  constructor() {
    this.core = new WebRenderer();
  }

  /**
   * Initializes the audio engine. Must be called after a user gesture.
   * @param sampleRate - Optional sample rate for the AudioContext (defaults to system default)
   */
  async initialize(sampleRate?: number): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.ctx = new AudioContext(sampleRate ? { sampleRate } : undefined);

    const node = await this.core.initialize(this.ctx, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
    });

    // Connect the WebRenderer's AudioWorkletNode to the destination
    node.connect(this.ctx.destination);

    // Listen for Elementary errors
    this.core.on("error", (e) => {
      console.error("[AudioEngine] Elementary error:", e);
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

    // Calculate transport time offset: el.time()/sr() gives audio context time,
    // we need to subtract an offset so it equals playheadPosition at this moment.
    // offset = currentContextTime - playheadPosition
    this.transportTimeOffset = this.ctx.currentTime - this.playheadPosition;

    // Re-render graph with new transport offset
    this.renderGraph();

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
    // Re-render to silence output
    this.renderGraph();
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

      // Update transport offset and re-render for seeking during playback
      this.transportTimeOffset = this.ctx.currentTime - this.playheadPosition;
      this.renderGraph();
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
   * Update clip states (FR-19)
   * Clips are rendered at their timeline positions using el.sampleseq
   */
  setClips(clips: ClipState[]): void {
    this.state.clips = clips;
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
   * Graph structure (FR-20):
   * Clip 1 (gain) ──┐
   * Clip 2 (gain) ──┼──> Track Sum ──> Track Gain ──┐
   *                                                  │
   * Clip 3 (gain) ──> Track Sum ──> Track Gain ─────┼──> Master Gain ──> Output
   *                                                  │
   * (mute/solo applied at track level)              │
   */
  private renderGraph(): void {
    if (!this.initialized) {
      return;
    }

    const { tracks, clips, masterGain } = this.state;
    const sampleRate = this.getSampleRate();

    // Determine if any track is soloed (FR-22)
    const anySoloed = tracks.some((t) => t.solo);

    // Transport-aware time signal in seconds for el.sampleseq (FR-19)
    // el.time()/sr() gives absolute audio context time, we subtract the offset
    // calculated at play() to get the transport/playhead position.
    const contextTimeSeconds = el.div(el.time(), el.sr());
    const timeInSeconds = el.sub(
      contextTimeSeconds,
      el.const({ key: "transport-offset", value: this.transportTimeOffset }),
    );

    // Build track signals
    const trackSignals: { left: NodeRepr_t; right: NodeRepr_t }[] = tracks.map((track) => {
      // Determine if this track should be audible (FR-22)
      const shouldPlay = anySoloed ? track.solo : !track.muted;

      // Get track gain value (0 if muted/not-soloed, otherwise convert from dB)
      const trackGainValue = shouldPlay ? dbToGain(track.gain) : 0;

      // Get all clips for this track (FR-21)
      const trackClips = clips.filter((clip) => clip.trackId === track.id);

      // Render each clip using el.sampleseq (FR-19, FR-23)
      // NOTE: We use two separate el.sampleseq calls for stereo instead of el.mc.sampleseq
      // because el.mc.sampleseq doesn't correctly resolve :0/:1 VFS paths
      const clipSignals: { left: NodeRepr_t; right: NodeRepr_t }[] = trackClips.map((clip) => {
        const vfsEntry = this.vfsEntries.get(clip.fileId);
        if (!vfsEntry) {
          // Audio not loaded yet, return silence
          return {
            left: el.const({ key: `clip-${clip.id}-left-empty`, value: 0 }),
            right: el.const({ key: `clip-${clip.id}-right-empty`, value: 0 }),
          };
        }

        // Calculate times in seconds for el.sampleseq
        const startTimeSeconds = clip.startTime / sampleRate;
        const clipDurationSeconds = clip.duration / sampleRate;
        // duration prop is the actual audio file duration, not the clip timeline duration
        const sampleDurationSeconds = vfsEntry.duration / vfsEntry.sampleRate;

        // Clip gain (FR-20)
        const clipGainValue = dbToGain(clip.gain);

        // Build sequence: trigger at start, stop at end of clip on timeline
        const seq = [
          { time: startTimeSeconds, value: 1 },
          { time: startTimeSeconds + clipDurationSeconds, value: 0 },
        ];

        // Validate values before passing to Elementary
        const hasInvalidValue =
          !Number.isFinite(startTimeSeconds) ||
          !Number.isFinite(clipDurationSeconds) ||
          !Number.isFinite(sampleDurationSeconds) ||
          !Number.isFinite(clipGainValue);

        if (hasInvalidValue) {
          console.error(`[AudioEngine] Invalid values for clip ${clip.id}, skipping`);
          return {
            left: el.const({ key: `clip-${clip.id}-left-invalid`, value: 0 }),
            right: el.const({ key: `clip-${clip.id}-right-invalid`, value: 0 }),
          };
        }

        // Get explicit VFS paths for left and right channels
        // Mono: use fileId directly; Stereo: use fileId:0 and fileId:1
        const leftPath = vfsEntry.channels === 1 ? clip.fileId : `${clip.fileId}:0`;
        const rightPath = vfsEntry.channels === 1 ? clip.fileId : `${clip.fileId}:1`;

        // Create sampleseq for left channel
        const leftSignal = el.sampleseq(
          {
            key: `clip-${clip.id}-left`,
            seq,
            path: leftPath,
            duration: sampleDurationSeconds,
          },
          timeInSeconds,
        );

        // Create sampleseq for right channel
        const rightSignal = el.sampleseq(
          {
            key: `clip-${clip.id}-right`,
            seq,
            path: rightPath,
            duration: sampleDurationSeconds,
          },
          timeInSeconds,
        );

        // Apply clip gain to both channels
        return {
          left: el.mul(
            el.const({ key: `clip-${clip.id}-gain-l`, value: clipGainValue }),
            leftSignal,
          ),
          right: el.mul(
            el.const({ key: `clip-${clip.id}-gain-r`, value: clipGainValue }),
            rightSignal,
          ),
        };
      });

      // Sum all clips on this track (FR-21)
      let trackLeft: NodeRepr_t;
      let trackRight: NodeRepr_t;

      if (clipSignals.length === 0) {
        // No clips - silence
        trackLeft = el.const({ key: `track-${track.id}-left-empty`, value: 0 });
        trackRight = el.const({ key: `track-${track.id}-right-empty`, value: 0 });
      } else if (clipSignals.length === 1) {
        trackLeft = clipSignals[0]!.left;
        trackRight = clipSignals[0]!.right;
      } else {
        // Sum multiple clips
        trackLeft = el.add(...clipSignals.map((s) => s.left));
        trackRight = el.add(...clipSignals.map((s) => s.right));
      }

      // Apply track gain with smoothing (FR-20)
      const smoothedGain = el.sm(
        el.const({ key: `track-${track.id}-gain`, value: trackGainValue }),
      );

      return {
        left: el.mul(smoothedGain, trackLeft),
        right: el.mul(smoothedGain, trackRight),
      };
    });

    // Sum all tracks (or silence if no tracks)
    let summedLeft: NodeRepr_t;
    let summedRight: NodeRepr_t;

    if (trackSignals.length === 0) {
      summedLeft = el.const({ key: "sum-left-empty", value: 0 });
      summedRight = el.const({ key: "sum-right-empty", value: 0 });
    } else if (trackSignals.length === 1) {
      summedLeft = trackSignals[0]!.left;
      summedRight = trackSignals[0]!.right;
    } else {
      summedLeft = el.add(...trackSignals.map((s) => s.left));
      summedRight = el.add(...trackSignals.map((s) => s.right));
    }

    // Apply master gain with smoothing
    const masterGainValue = dbToGain(masterGain);
    const smoothedMasterGain = el.sm(el.const({ key: "master-gain", value: masterGainValue }));

    const masterLeft = el.mul(smoothedMasterGain, summedLeft);
    const masterRight = el.mul(smoothedMasterGain, summedRight);

    // Render silence when not playing
    if (!this.playing) {
      this.core.render(
        el.const({ key: "silence-l", value: 0 }),
        el.const({ key: "silence-r", value: 0 }),
      );
      return;
    }

    // Render stereo output
    this.core.render(masterLeft, masterRight);
  }
}
