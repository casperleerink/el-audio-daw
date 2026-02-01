import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  AudioEngine,
  type ClipState,
  type TrackState,
  type TrackEffect,
  type MeterValue,
} from "@el-audio-daw/audio";
import { getDownloadUrl, clearUrlCache } from "@/lib/storage";

interface AudioStoreState {
  // Reactive UI state
  isEngineInitializing: boolean;
  isEngineReady: boolean;
  isPlaying: boolean;
  playheadTime: number;
  masterGain: number;

  // Non-reactive config (for lazy initialization)
  sampleRate: number;

  // Pending data (buffered until engine is ready)
  pendingTracks: TrackState[] | null;
  pendingClips: ClipState[] | null;
  pendingEffects: TrackEffect[] | null;

  // Actions
  setSampleRate: (sampleRate: number) => void;
  initializeEngine: () => Promise<AudioEngine | null>;
  play: () => Promise<void>;
  stop: () => void;
  togglePlayStop: () => Promise<void>;
  seek: (time: number) => Promise<void>;
  setMasterGain: (gain: number) => void;
  dispose: () => void;

  // Engine sync methods (called by useAudioEngineSync hook)
  setTracks: (tracks: TrackState[]) => void;
  setClips: (clips: ClipState[]) => void;
  setEffects: (effects: TrackEffect[]) => void;
  loadAudioIntoVFS: (
    key: string,
    storageKey: string,
    projectId: string
  ) => Promise<void>;

  // Direct parameter updates (for real-time control without graph rebuild)
  setTrackGain: (trackId: string, gainDb: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;

  // Meter subscription
  onMeterUpdate: (
    callback: (meters: Map<string, MeterValue>) => void
  ) => () => void;
}

// Engine instance stored outside of reactive state to avoid unnecessary re-renders
let engineInstance: AudioEngine | null = null;

export const useAudioStore = create<AudioStoreState>((set, get) => ({
  // Initial state
  isEngineInitializing: false,
  isEngineReady: false,
  isPlaying: false,
  playheadTime: 0,
  masterGain: 0,
  sampleRate: 44100,
  pendingTracks: null,
  pendingClips: null,
  pendingEffects: null,

  setSampleRate: (sampleRate: number) => {
    set({ sampleRate });
  },

  initializeEngine: async () => {
    if (engineInstance?.isInitialized()) {
      return engineInstance;
    }

    const {
      sampleRate,
      pendingTracks,
      pendingClips,
      pendingEffects,
      masterGain,
    } = get();
    set({ isEngineInitializing: true });

    try {
      const engine = new AudioEngine();
      await engine.initialize(sampleRate);
      engineInstance = engine;

      // Subscribe to playhead updates
      engine.onPlayheadUpdate((time: number) => {
        set({ playheadTime: time });
      });

      // Sync any pending data that was set before engine was ready
      if (pendingTracks) {
        engine.setTracks(pendingTracks);
      }
      if (pendingEffects) {
        engine.setEffects(pendingEffects);
      }
      if (pendingClips) {
        engine.setClips(pendingClips);
      }
      engine.setMasterGain(masterGain);

      set({ isEngineReady: true, isEngineInitializing: false });
      return engine;
    } catch (err) {
      console.error("Failed to initialize audio engine:", err);
      set({ isEngineInitializing: false });
      return null;
    }
  },

  play: async () => {
    const { initializeEngine } = get();

    // Lazy initialize engine on first play (requires user gesture)
    if (!engineInstance) {
      const engine = await initializeEngine();
      if (!engine) return;
    }

    engineInstance!.play();
    set({ isPlaying: true });
  },

  stop: () => {
    const { isPlaying } = get();

    if (!isPlaying) {
      // Already stopped, reset playhead to 0
      engineInstance?.setPlayhead(0);
      set({ playheadTime: 0 });
      return;
    }

    if (!engineInstance) return;
    engineInstance.stop();
    set({ isPlaying: false });
  },

  togglePlayStop: async () => {
    const { isPlaying, play, stop } = get();
    if (isPlaying) {
      stop();
    } else {
      await play();
    }
  },

  seek: async (time: number) => {
    const { initializeEngine } = get();

    // Lazy initialize engine on seek (requires user gesture)
    if (!engineInstance) {
      await initializeEngine();
    }

    engineInstance?.setPlayhead(time);
    set({ playheadTime: time });
  },

  setMasterGain: (gain: number) => {
    set({ masterGain: gain });
    engineInstance?.setMasterGain(gain);
  },

  dispose: () => {
    if (engineInstance) {
      engineInstance.dispose();
      engineInstance = null;
    }
    clearUrlCache();
    set({
      isEngineInitializing: false,
      isEngineReady: false,
      isPlaying: false,
      playheadTime: 0,
      pendingTracks: null,
      pendingClips: null,
      pendingEffects: null,
    });
  },

  // Engine sync methods - buffer data if engine not ready, sync immediately if ready
  setTracks: (tracks: TrackState[]) => {
    set({ pendingTracks: tracks });
    engineInstance?.setTracks(tracks);
  },

  setClips: (clips: ClipState[]) => {
    set({ pendingClips: clips });
    engineInstance?.setClips(clips);
  },

  setEffects: (effects: TrackEffect[]) => {
    set({ pendingEffects: effects });
    engineInstance?.setEffects(effects);
  },

  loadAudioIntoVFS: async (
    key: string,
    storageKey: string,
    projectId: string
  ) => {
    if (!engineInstance?.isInitialized()) return;
    try {
      // Fetch presigned download URL from storage key
      const downloadUrl = await getDownloadUrl(projectId, storageKey);
      await engineInstance.loadAudioIntoVFS(key, downloadUrl);
    } catch (err) {
      console.error(`Failed to load audio ${key}:`, err);
    }
  },

  // Direct parameter updates - bypass React state for real-time responsiveness
  setTrackGain: (trackId: string, gainDb: number) => {
    engineInstance?.setTrackGain(trackId, gainDb);
  },

  setTrackPan: (trackId: string, pan: number) => {
    engineInstance?.setTrackPan(trackId, pan);
  },

  onMeterUpdate: (callback) => {
    if (!engineInstance) return () => {};
    return engineInstance.onMeterUpdate(callback);
  },
}));

// Selector hooks for optimized subscriptions
export const usePlayheadTime = () => useAudioStore((s) => s.playheadTime);
export const useIsPlaying = () => useAudioStore((s) => s.isPlaying);
export const useIsEngineReady = () => useAudioStore((s) => s.isEngineReady);
export const useIsEngineInitializing = () =>
  useAudioStore((s) => s.isEngineInitializing);
export const useMasterGain = () => useAudioStore((s) => s.masterGain);

// Action hooks (stable references, won't cause re-renders)
// useShallow prevents infinite loops by using shallow equality comparison
export const useAudioActions = () =>
  useAudioStore(
    useShallow((s) => ({
      play: s.play,
      stop: s.stop,
      togglePlayStop: s.togglePlayStop,
      seek: s.seek,
      setMasterGain: s.setMasterGain,
      onMeterUpdate: s.onMeterUpdate,
    }))
  );

// Internal sync actions (used by useAudioEngineSync)
export const useAudioSyncActions = () =>
  useAudioStore(
    useShallow((s) => ({
      setSampleRate: s.setSampleRate,
      setTracks: s.setTracks,
      setClips: s.setClips,
      setEffects: s.setEffects,
      loadAudioIntoVFS: s.loadAudioIntoVFS,
      dispose: s.dispose,
    }))
  );
