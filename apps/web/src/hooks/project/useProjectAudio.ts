import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useSampleRate } from "@/stores/projectStore";
import { useProjectData } from "./useProjectData";
import { useProjectTracks } from "./useProjectTracks";
import { useProjectClips } from "./useProjectClips";
import { useProjectEffects } from "./useProjectEffects";

/**
 * Hook for audio engine integration in the project editor.
 * Combines project data with the audio engine.
 */
export function useProjectAudio() {
  const sampleRate = useSampleRate();
  const { clipUrls } = useProjectData();
  const { tracksWithOptimisticUpdates } = useProjectTracks();
  const { clipsForEngine } = useProjectClips();
  const { effectsForEngine } = useProjectEffects();

  const {
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
  } = useAudioEngine({
    sampleRate,
    tracks: tracksWithOptimisticUpdates,
    clips: clipsForEngine,
    clipUrls,
    effects: effectsForEngine,
  });

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
