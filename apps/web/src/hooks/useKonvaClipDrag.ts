import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type Konva from "konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";

interface ClipDragState {
  clipId: string;
  originalStartTime: number;
  originalTrackId: string;
  currentTrackId: string;
  currentStartTime: number;
}

interface UseKonvaClipDragOptions {
  tracks: { _id: string }[];
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  updateClipPosition: (args: {
    id: string;
    startTime: number;
    trackId?: string;
  }) => Promise<unknown>;
}

export function useKonvaClipDrag({
  tracks,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  updateClipPosition,
}: UseKonvaClipDragOptions) {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  const handleDragStart = useCallback(
    (clipId: string, trackId: string, startTime: number) => {
      justFinishedDragRef.current = false;
      setClipDragState({
        clipId,
        originalStartTime: startTime,
        originalTrackId: trackId,
        currentTrackId: trackId,
        currentStartTime: startTime,
      });
    },
    [],
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, clipId: string) => {
      const node = e.target;
      const x = node.x();
      const y = node.y();

      // Constrain X >= 0
      if (x < 0) node.x(0);

      // Calculate time from position
      const viewStartTime = scrollLeft / pixelsPerSecond;
      const effectiveX = Math.max(0, x);
      const timeSeconds = viewStartTime + effectiveX / pixelsPerSecond;
      const timeInSamples = Math.round(timeSeconds * sampleRate);

      // Calculate target track from Y
      const trackAreaY = y + scrollTop - RULER_HEIGHT;
      const targetTrackIndex = Math.max(
        0,
        Math.min(tracks.length - 1, Math.floor(trackAreaY / TRACK_HEIGHT)),
      );
      const targetTrackId = tracks[targetTrackIndex]?._id;

      if (targetTrackId) {
        setClipDragState((prev) =>
          prev && prev.clipId === clipId
            ? { ...prev, currentTrackId: targetTrackId, currentStartTime: timeInSamples }
            : prev,
        );
      }
    },
    [scrollLeft, scrollTop, pixelsPerSecond, sampleRate, tracks],
  );

  const handleDragEnd = useCallback(
    async (clipId: string) => {
      justFinishedDragRef.current = true;
      // Reset after a tick so click handlers can check it
      setTimeout(() => {
        justFinishedDragRef.current = false;
      }, 50);

      const state = clipDragState;
      if (!state || state.clipId !== clipId) {
        setClipDragState(null);
        return;
      }

      setClipDragState(null);

      try {
        const trackChanged = state.currentTrackId !== state.originalTrackId;
        await updateClipPosition({
          id: clipId,
          startTime: state.currentStartTime,
          trackId: trackChanged ? state.currentTrackId : undefined,
        });
      } catch {
        toast.error("Failed to move clip");
      }
    },
    [clipDragState, updateClipPosition],
  );

  return {
    clipDragState,
    justFinishedDrag: justFinishedDragRef.current,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}
