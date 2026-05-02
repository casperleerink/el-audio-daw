import type { EffectAudioState, ProjectAudioState } from "./project-audio-state.js";

export type ProjectAudioProjectionSample = {
  id: string;
  storageUrl: string | null;
};

export type ProjectAudioProjectionClip = {
  id: string;
  trackId: string;
  sampleId: string;
  startSampleFrame: number;
  durationSampleFrames: number;
  sourceStartSampleFrame: number;
  gain: number | null;
};

export type ProjectAudioProjectionEffect = {
  id: string;
  trackId: string;
  order: number;
  enabled: boolean | null;
  effectData: {
    type: "filter";
    cutoff: number;
    resonance: number;
    filterType: "lowpass" | "highpass" | "bandpass" | "notch";
  };
};

export type ProjectAudioProjectionTrack = {
  id: string;
  order: number;
  muted: boolean | null;
  solo: boolean | null;
  gain: number | null;
  pan: number | null;
  effects?: readonly ProjectAudioProjectionEffect[];
};

export type ProjectAudioProjectionProject = {
  id: string;
  sampleRate: number | null;
  tracks: readonly ProjectAudioProjectionTrack[];
  clips: readonly ProjectAudioProjectionClip[];
  samples: readonly ProjectAudioProjectionSample[];
};

export type ProjectAudioAssetReference = {
  assetId: string;
  storageUrl: string;
};

export type ProjectAudioPlan = {
  snapshot: ProjectAudioState;
  assetsToLoad: ProjectAudioAssetReference[];
  assetsToUnload: string[];
  activeAssetIds: Set<string>;
};

export function createProjectAudioPlan(input: {
  project: ProjectAudioProjectionProject;
  previousActiveAssetIds?: ReadonlySet<string>;
}): ProjectAudioPlan {
  const sampleRate = input.project.sampleRate ?? 44_100;
  const samplesById = new Map(input.project.samples.map((sample) => [sample.id, sample]));
  const activeAssetIds = new Set(input.project.clips.map((clip) => clip.sampleId));

  const assetsToLoad: ProjectAudioAssetReference[] = [];
  for (const assetId of activeAssetIds) {
    if (input.previousActiveAssetIds?.has(assetId)) continue;
    const sample = samplesById.get(assetId);
    if (sample?.storageUrl) assetsToLoad.push({ assetId, storageUrl: sample.storageUrl });
  }

  const assetsToUnload = input.previousActiveAssetIds
    ? [...input.previousActiveAssetIds].filter((assetId) => !activeAssetIds.has(assetId))
    : [];

  const tracks = [...input.project.tracks].sort((a, b) => a.order - b.order);

  return {
    snapshot: {
      projectId: input.project.id,
      sampleRate,
      tracks: tracks.map((track, index) => ({
        id: track.id,
        kind: "audio",
        order: index,
        muted: track.muted ?? false,
        solo: track.solo ?? false,
        gainDb: track.gain ?? 0,
        pan: track.pan ?? 0,
      })),
      clips: input.project.clips.map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        assetId: clip.sampleId,
        startSamples: clip.startSampleFrame,
        durationSamples: clip.durationSampleFrames,
        sourceStartSamples: clip.sourceStartSampleFrame,
        gainDb: clip.gain ?? 0,
      })),
      effects: tracks.flatMap(projectTrackEffectsToAudioEffects),
      master: { gainDb: 0 },
    },
    assetsToLoad,
    assetsToUnload,
    activeAssetIds,
  };
}

function projectTrackEffectsToAudioEffects(track: ProjectAudioProjectionTrack): EffectAudioState[] {
  return [...(track.effects ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((effect) => ({
      id: effect.id,
      ownerType: "track",
      ownerId: track.id,
      order: effect.order,
      enabled: effect.enabled ?? true,
      plugin: {
        type: "internal",
        name: "filter",
        params: {
          cutoff: effect.effectData.cutoff,
          resonance: effect.effectData.resonance,
          filterType: effect.effectData.filterType,
        },
      },
    }));
}
