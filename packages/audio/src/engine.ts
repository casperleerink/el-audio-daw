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
