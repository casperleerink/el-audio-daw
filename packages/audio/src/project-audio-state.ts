export type ProjectAudioState = {
  projectId: string;
  sampleRate: number;
  tracks: TrackAudioState[];
  clips: ClipAudioState[];
  effects: EffectAudioState[];
  master: {
    gainDb: number;
  };
};

export type TrackAudioState = {
  id: string;
  kind: "audio" | "instrument" | "bus" | "master";
  order: number;
  muted: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
};

export type ClipAudioState = {
  id: string;
  trackId: string;
  assetId: string;
  startSamples: number;
  durationSamples: number;
  sourceStartSamples: number;
  gainDb: number;
  fadeInSamples?: number;
  fadeOutSamples?: number;
};

export type InternalPluginState = {
  type: "internal";
  name: "gain" | "pan" | "filter";
  params: Record<string, number | string | boolean>;
};

export type ExternalPluginState = {
  type: "external";
  pluginId: string;
  state: unknown;
};

export type EffectAudioState = {
  id: string;
  ownerType: "track" | "bus" | "master";
  ownerId: string;
  order: number;
  enabled: boolean;
  plugin: InternalPluginState | ExternalPluginState;
};

export type ProjectAudioUpdate =
  | { type: "Replace"; project: ProjectAudioState }
  | { type: "SetTrack"; track: TrackAudioState }
  | { type: "RemoveTrack"; trackId: string }
  | { type: "SetClip"; clip: ClipAudioState }
  | { type: "RemoveClip"; clipId: string };
