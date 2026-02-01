import { useEffect } from "react";
import type { ClipState, TrackState, TrackEffect } from "@el-audio-daw/audio";
import { useAudioSyncActions, useIsEngineReady } from "@/stores/audioStore";

type TrackData = {
  _id: string;
  muted: boolean;
  solo: boolean;
  gain: number;
  pan?: number;
};

type ClipData = {
  _id: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  gain: number;
};

type EffectData = {
  id: string;
  trackId: string;
  order: number;
  enabled: boolean;
  effectData: {
    type: "filter";
    cutoff: number;
    resonance: number;
    filterType: "lowpass" | "highpass" | "bandpass" | "notch";
  };
};

interface UseAudioEngineSyncOptions {
  projectId: string | null;
  sampleRate: number;
  tracks: TrackData[] | undefined;
  clips: ClipData[] | undefined;
  clipStorageKeys: Record<string, string | null> | undefined;
  effects?: EffectData[] | undefined;
}

/**
 * Hook that syncs project data to the audio engine store.
 * Should be called once at the top level of the project editor.
 * Handles engine initialization and data synchronization.
 *
 * Data is buffered in the store even before the engine is ready,
 * and synced when the engine initializes (on first play/seek).
 */
export function useAudioEngineSync({
  projectId,
  sampleRate,
  tracks,
  clips,
  clipStorageKeys,
  effects,
}: UseAudioEngineSyncOptions): void {
  const isEngineReady = useIsEngineReady();
  const { setSampleRate, setTracks, setClips, setEffects, loadAudioIntoVFS, dispose } =
    useAudioSyncActions();

  // Set sample rate for lazy initialization
  useEffect(() => {
    setSampleRate(sampleRate);
  }, [sampleRate, setSampleRate]);

  // Sync tracks to store (buffers if engine not ready, syncs immediately if ready)
  useEffect(() => {
    if (!tracks) return;

    const trackStates: TrackState[] = tracks.map((t) => ({
      id: t._id,
      muted: t.muted,
      solo: t.solo,
      gain: t.gain,
      pan: t.pan ?? 0,
    }));

    setTracks(trackStates);
  }, [tracks, setTracks]);

  // Sync effects to store (buffers if engine not ready, syncs immediately if ready)
  useEffect(() => {
    if (!effects) return;

    const effectStates: TrackEffect[] = effects.map((e) => ({
      id: e.id,
      trackId: e.trackId,
      order: e.order,
      enabled: e.enabled,
      effectData: e.effectData,
    }));

    setEffects(effectStates);
  }, [effects, setEffects]);

  // Sync clips to store (buffers if engine not ready, syncs immediately if ready)
  // Note: Clips are synced immediately to buffer them. VFS loading happens when engine is ready.
  useEffect(() => {
    if (!clips) return;

    const clipStates: ClipState[] = clips.map((clip) => ({
      id: clip._id,
      trackId: clip.trackId,
      fileId: clip.audioFileId,
      startTime: clip.startTime,
      duration: clip.duration,
      audioStartTime: clip.audioStartTime,
      gain: clip.gain,
    }));

    setClips(clipStates);
  }, [clips, setClips]);

  // Load audio into VFS when engine is ready
  // This is separate from clip sync because VFS loading requires the engine
  useEffect(() => {
    if (!isEngineReady || !projectId || !clips || !clipStorageKeys) return;

    // Load all audio into VFS (idempotent - won't reload if already loaded)
    const loadPromises = clips.map(async (clip) => {
      const storageKey = clipStorageKeys[clip.audioFileId];
      if (storageKey) {
        await loadAudioIntoVFS(clip.audioFileId, storageKey, projectId);
      }
    });

    // After all audio is loaded, re-sync clips to trigger graph re-render
    // This ensures clips play after VFS loading completes
    Promise.all(loadPromises).then(() => {
      const clipStates: ClipState[] = clips.map((clip) => ({
        id: clip._id,
        trackId: clip.trackId,
        fileId: clip.audioFileId,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
      }));
      setClips(clipStates);
    });
  }, [isEngineReady, projectId, clips, clipStorageKeys, loadAudioIntoVFS, setClips]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);
}
