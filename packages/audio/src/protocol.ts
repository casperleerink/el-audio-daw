import type { ProjectAudioState, ProjectAudioUpdate } from "./project-audio-state.js";

export type AudioEngineOptions = {
  sampleRate?: number;
  emitPlayheadIntervalMs?: number;
};

export type AudioAssetSource = {
  id: string;
  url: string;
};

export type DecodedAudioAsset = {
  id: string;
  sampleRate: number;
  channels: Float32Array[];
  lengthSamples: number;
};

export type EngineCommand =
  | { type: "Initialize"; sampleRate: number; emitPlayheadIntervalMs: number }
  | { type: "LoadProject"; project: ProjectAudioState }
  | { type: "ApplyProjectUpdate"; update: ProjectAudioUpdate }
  | { type: "LoadAsset"; asset: DecodedAudioAsset }
  | { type: "UnloadAsset"; assetId: string }
  | { type: "Play" }
  | { type: "Pause" }
  | { type: "Stop" }
  | { type: "Seek"; timeSeconds: number }
  | { type: "SetTrackGain"; trackId: string; gainDb: number }
  | { type: "SetTrackPan"; trackId: string; pan: number }
  | { type: "SetMasterGain"; gainDb: number };

export type PlayheadEvent = {
  type: "Playhead";
  timeSeconds: number;
  positionSamples: number;
};

export type MeterValue = {
  id: string;
  peak: number;
  rms: number;
};

export type MeterEvent = {
  type: "Meters";
  meters: MeterValue[];
};

export type AudioEngineError = {
  type: "Error";
  message: string;
};

export type EngineEvent = { type: "Ready" } | PlayheadEvent | MeterEvent | AudioEngineError;
