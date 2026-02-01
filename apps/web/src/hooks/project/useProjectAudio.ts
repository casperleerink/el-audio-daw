import {
  usePlayheadTime,
  useIsPlaying,
  useIsEngineReady,
  useIsEngineInitializing,
  useMasterGain,
  useAudioActions,
} from "@/stores/audioStore";

/**
 * Hook for audio engine integration in the project editor.
 * Uses the shared Zustand store to ensure all components share the same engine instance.
 * Uses selectors to minimize re-renders - only subscribes to the specific values needed.
 */
export function useProjectAudio() {
  const isEngineInitializing = useIsEngineInitializing();
  const isEngineReady = useIsEngineReady();
  const isPlaying = useIsPlaying();
  const playheadTime = usePlayheadTime();
  const masterGain = useMasterGain();
  const { play, stop, togglePlayStop, seek, setMasterGain, onMeterUpdate } = useAudioActions();

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
    meterSubscribe: onMeterUpdate,
  };
}
