export interface ClipData {
  _id: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // offset into source audio in samples
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
