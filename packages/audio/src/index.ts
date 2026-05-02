export { AudioEngine } from "./engine.js";
export type {
  TrackState,
  ClipState,
  AudioEngineState,
  VFSEntry,
  MeterValue,
  TrackEffect,
  EffectData,
  FilterEffectData,
  FilterType,
} from "./engine.js";
export { AudioEngineController } from "./controller.js";
export { createAudioWorkletModuleSource, createAudioWorkletModuleUrl } from "./worklet-module.js";
export type {
  AudioEngineOptions,
  AudioAssetSource,
  DecodedAudioAsset,
  EngineCommand,
  EngineEvent,
  PlayheadEvent,
  MeterEvent,
  AudioEngineError,
} from "./protocol.js";
export type {
  ProjectAudioState,
  ProjectAudioUpdate,
  TrackAudioState,
  ClipAudioState,
  EffectAudioState,
  InternalPluginState,
  ExternalPluginState,
} from "./project-audio-state.js";
export { createProjectAudioPlan } from "./project-audio-projection.js";
export type {
  ProjectAudioPlan,
  ProjectAudioProjectionProject,
  ProjectAudioProjectionTrack,
  ProjectAudioProjectionClip,
  ProjectAudioProjectionSample,
  ProjectAudioProjectionEffect,
  ProjectAudioAssetReference,
} from "./project-audio-projection.js";
export { dbToGain, gainToDb, clampDb } from "./utils.js";
