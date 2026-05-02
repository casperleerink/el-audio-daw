import { useEffect, useMemo, useRef } from "react";
import {
  createProjectAudioPlan,
  type ClipState,
  type ProjectAudioPlan,
  type ProjectAudioProjectionProject,
  type TrackState,
} from "@el-audio-daw/audio";
import { useAudioStore } from "@/stores/audioStore";

interface UseAudioEngineSyncOptions {
  project: ProjectAudioProjectionProject | null | undefined;
}

/**
 * Syncs the Project audio projection to the audio engine store.
 *
 * The Project-to-audio rules live in `@el-audio-daw/audio` so React only owns side effects:
 * buffering projected state, loading Sample assets, and disposing the engine on unmount.
 */
export function useAudioEngineSync({ project }: UseAudioEngineSyncOptions): void {
  const previousActiveAssetIdsRef = useRef<ReadonlySet<string> | undefined>(undefined);

  const audioPlan = useMemo<ProjectAudioPlan | null>(() => {
    if (!project) return null;
    return createProjectAudioPlan({
      project,
      previousActiveAssetIds: previousActiveAssetIdsRef.current,
    });
  }, [project]);

  const isEngineReady = useAudioStore((s) => s.isEngineReady);
  const setSampleRate = useAudioStore((s) => s.setSampleRate);
  const setTracks = useAudioStore((s) => s.setTracks);
  const setClips = useAudioStore((s) => s.setClips);
  const setEffects = useAudioStore((s) => s.setEffects);
  const loadAudioIntoVFS = useAudioStore((s) => s.loadAudioIntoVFS);
  const pruneSampleAssets = useAudioStore((s) => s.pruneSampleAssets);
  const dispose = useAudioStore((s) => s.dispose);

  useEffect(() => {
    if (!audioPlan) return;
    setSampleRate(audioPlan.snapshot.sampleRate);
  }, [audioPlan, setSampleRate]);

  useEffect(() => {
    if (!audioPlan) return;

    const trackStates: TrackState[] = audioPlan.snapshot.tracks.map((track) => ({
      id: track.id,
      muted: track.muted,
      solo: track.solo,
      gain: track.gainDb,
      pan: track.pan,
    }));

    setTracks(trackStates);
  }, [audioPlan, setTracks]);

  useEffect(() => {
    if (!audioPlan) return;
    setEffects([]);
  }, [audioPlan, setEffects]);

  useEffect(() => {
    if (!audioPlan) return;
    setClips(toClipStates(audioPlan));
  }, [audioPlan, setClips]);

  useEffect(() => {
    if (!isEngineReady || !project || !audioPlan) return;

    const loadPromises = audioPlan.assetsToLoad.map((asset) =>
      loadAudioIntoVFS(asset.assetId, asset.storageUrl, project.id),
    );

    Promise.all(loadPromises).then(async () => {
      await pruneSampleAssets([...audioPlan.activeAssetIds]);
      setClips(toClipStates(audioPlan));
      previousActiveAssetIdsRef.current = audioPlan.activeAssetIds;
    });
  }, [isEngineReady, project, audioPlan, loadAudioIntoVFS, pruneSampleAssets, setClips]);

  useEffect(() => {
    return () => {
      dispose();
      previousActiveAssetIdsRef.current = undefined;
    };
  }, [dispose]);
}

function toClipStates(audioPlan: ProjectAudioPlan): ClipState[] {
  return audioPlan.snapshot.clips.map((clip) => ({
    id: clip.id,
    trackId: clip.trackId,
    fileId: clip.assetId,
    startSampleFrame: clip.startSamples,
    durationSampleFrames: clip.durationSamples,
    sourceStartSampleFrame: clip.sourceStartSamples,
    gain: clip.gainDb,
  }));
}
