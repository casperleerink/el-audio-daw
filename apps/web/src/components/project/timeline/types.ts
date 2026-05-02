export interface ClipData {
  _id: string;
  trackId: string;
  sampleId: string;
  name: string;
  startSampleFrame: number;
  durationSampleFrames: number;
  sourceStartSampleFrame: number;
  pending?: boolean;
}

export interface ClipRenderData extends ClipData {
  selected?: boolean;
}

export interface CanvasColors {
  background: string;
  border: string;
  muted: string;
}
