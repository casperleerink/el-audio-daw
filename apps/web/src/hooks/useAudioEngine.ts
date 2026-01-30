import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioEngine, type ClipState, type TrackState } from "@el-audio-daw/audio";
import { useMeterValues } from "./useMeterValues";

type TrackData = {
  _id: string;
  muted: boolean;
  solo: boolean;
  gain: number;
};

type ClipData = {
  _id: string;
  trackId: string;
  fileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  gain: number;
};

type ClipUrlData = {
  fileId: string;
  url: string | null;
};

type UseAudioEngineOptions = {
  sampleRate: number;
  tracks: TrackData[] | undefined;
  clips: ClipData[] | undefined;
  clipUrls: ClipUrlData[] | undefined;
};

/**
 * Hook for managing the audio engine lifecycle and state.
 * Handles initialization, track/clip syncing, playback controls, and cleanup.
 */
export function useAudioEngine({ sampleRate, tracks, clips, clipUrls }: UseAudioEngineOptions) {
  const [isEngineInitializing, setIsEngineInitializing] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [masterGain, setMasterGain] = useState(0);

  const engineRef = useRef<AudioEngine | null>(null);

  // Meter subscription hook - will be initialized once engine is ready
  const { subscribe: meterSubscribe } = useMeterValues(isEngineReady ? engineRef.current : null);

  // Initialize audio engine (called lazily on first transport action)
  const initializeEngine = useCallback(async () => {
    if (engineRef.current?.isInitialized()) {
      return engineRef.current;
    }

    setIsEngineInitializing(true);
    try {
      const engine = new AudioEngine();
      await engine.initialize(sampleRate);
      engineRef.current = engine;

      engine.onPlayheadUpdate((time: number) => {
        setPlayheadTime(time);
      });

      setIsEngineReady(true);
      return engine;
    } catch (err) {
      toast.error("Failed to initialize audio engine. Please try again.");
      console.error(err);
      return null;
    } finally {
      setIsEngineInitializing(false);
    }
  }, [sampleRate]);

  // Sync tracks to audio engine
  useEffect(() => {
    if (!isEngineReady || !engineRef.current?.isInitialized() || !tracks) return;

    const trackStates: TrackState[] = tracks.map((t) => ({
      id: t._id,
      muted: t.muted,
      solo: t.solo,
      gain: t.gain,
    }));

    engineRef.current.setTracks(trackStates);
  }, [isEngineReady, tracks]);

  // Sync master gain to audio engine
  useEffect(() => {
    if (!isEngineReady || !engineRef.current?.isInitialized()) return;
    engineRef.current.setMasterGain(masterGain);
  }, [isEngineReady, masterGain]);

  // Load clips into VFS and sync to audio engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!isEngineReady || !engine?.isInitialized() || !clips || !clipUrls) return;

    // Build a map of fileId -> URL for quick lookup
    const urlMap = new Map<string, string>();
    for (const clipUrl of clipUrls) {
      if (clipUrl.url) {
        urlMap.set(clipUrl.fileId, clipUrl.url);
      }
    }

    // Load all audio into VFS (only loads if not already loaded)
    const loadPromises = clips.map(async (clip) => {
      const url = urlMap.get(clip.fileId);
      if (!url) return;

      try {
        // This is idempotent - it won't reload if already in VFS
        await engine.loadAudioIntoVFS(clip.fileId, url);
      } catch (err) {
        console.error(`Failed to load audio for clip ${clip.name}:`, err);
      }
    });

    // After loading, sync clip state to engine for playback
    Promise.all(loadPromises).then(() => {
      const clipStates: ClipState[] = clips.map((clip) => ({
        id: clip._id,
        trackId: clip.trackId,
        fileId: clip.fileId,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
      }));
      engine.setClips(clipStates);
    });
  }, [isEngineReady, clips, clipUrls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      engine = await initializeEngine();
      if (!engine) return;
    }
    engine.play();
    setIsPlaying(true);
  }, [initializeEngine]);

  const stop = useCallback(() => {
    if (!isPlaying) {
      // Already stopped, reset playhead to 0
      engineRef.current?.setPlayhead(0);
      setPlayheadTime(0);
      return;
    }
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
  }, [isPlaying]);

  const togglePlayStop = useCallback(async () => {
    if (isPlaying) {
      stop();
    } else {
      await play();
    }
  }, [isPlaying, play, stop]);

  const seek = useCallback(
    async (time: number) => {
      let engine = engineRef.current;
      if (!engine) {
        engine = await initializeEngine();
      }
      engine?.setPlayhead(time);
      setPlayheadTime(time);
    },
    [initializeEngine],
  );

  return {
    isEngineInitializing,
    isEngineReady,
    isPlaying,
    playheadTime,
    masterGain,
    setMasterGain,
    play,
    stop,
    togglePlayStop,
    seek,
    meterSubscribe,
  };
}
