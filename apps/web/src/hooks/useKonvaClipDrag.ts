import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type Konva from "konva";
import type { Zero } from "@rocicorp/zero";
import { CLIP_PADDING, RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import type { ClipData } from "@/components/project/timeline/types";
import { useUndoStore } from "@/stores/undoStore";
import { executeTimelineEdit } from "@/timeline-edit/executeTimelineEdit";

interface ClipDragState {
  clipId: string;
  originalStartSampleFrame: number;
  originalTrackId: string;
  currentTrackId: string;
  currentStartSampleFrame: number;
  isDuplicating: boolean;
}

interface UseKonvaClipDragOptions {
  tracks: { _id: string }[];
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  z: Zero;
  selectedClipIds: Set<string>;
  clips: ClipData[];
  projectId: string;
  onSelectClip?: (clipId: string, trackId: string) => void;
}

export function useKonvaClipDrag({
  tracks,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  z,
  selectedClipIds,
  clips,
  projectId,
  onSelectClip,
}: UseKonvaClipDragOptions) {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  const handleDragStart = useCallback(
    (
      e: Konva.KonvaEventObject<DragEvent>,
      clipId: string,
      trackId: string,
      startSampleFrame: number,
    ) => {
      justFinishedDragRef.current = false;

      const selectedClips = clips.filter((clip) => selectedClipIds.has(clip._id));
      const shouldResetSelection =
        !selectedClipIds.has(clipId) || selectedClips.some((clip) => clip.trackId !== trackId);
      if (shouldResetSelection) {
        onSelectClip?.(clipId, trackId);
      }

      setClipDragState({
        clipId,
        originalStartSampleFrame: startSampleFrame,
        originalTrackId: trackId,
        currentTrackId: trackId,
        currentStartSampleFrame: startSampleFrame,
        isDuplicating: e.evt.altKey,
      });
    },
    [clips, selectedClipIds, onSelectClip],
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

      // Keep the dragged Clip visually snapped to the target Track lane.
      node.y(RULER_HEIGHT + targetTrackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING);

      if (targetTrackId) {
        setClipDragState((prev) =>
          prev && prev.clipId === clipId
            ? { ...prev, currentTrackId: targetTrackId, currentStartSampleFrame: timeInSamples }
            : prev,
        );
      }
    },
    [scrollLeft, scrollTop, pixelsPerSecond, sampleRate, tracks],
  );

  const handleDragEnd = useCallback(
    async (e: Konva.KonvaEventObject<DragEvent>, clipId: string) => {
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

      if (state.isDuplicating) {
        // Reset Konva node to original position so the original Clip stays put.
        const node = e.target;
        const originalStartSeconds = state.originalStartSampleFrame / sampleRate;
        const viewStartTime = scrollLeft / pixelsPerSecond;
        const originalX = (originalStartSeconds - viewStartTime) * pixelsPerSecond;
        const originalTrackIndex = tracks.findIndex((t) => t._id === state.originalTrackId);
        const originalY =
          RULER_HEIGHT + originalTrackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING;
        node.position({ x: originalX, y: originalY });

        try {
          const result = await executeTimelineEdit({
            z,
            projectId,
            clips,
            tracks,
            selectedClipIds,
            pushUndo: useUndoStore.getState().push,
            intent: {
              type: "duplicate-clips",
              draggedClipId: clipId,
              requestedTrackId: state.currentTrackId,
              requestedStartSampleFrame: state.currentStartSampleFrame,
            },
          });
          if (result.status === "blocked") {
            toast.error("No room to duplicate clip");
            return;
          }
        } catch {
          toast.error("Failed to duplicate clip");
        }
      } else {
        try {
          const result = await executeTimelineEdit({
            z,
            projectId,
            clips,
            tracks,
            selectedClipIds,
            pushUndo: useUndoStore.getState().push,
            intent: {
              type: "move-clips",
              draggedClipId: clipId,
              requestedTrackId: state.currentTrackId,
              requestedStartSampleFrame: state.currentStartSampleFrame,
            },
          });
          if (result.status === "blocked") {
            toast.error("No room to move clip");
            return;
          }
        } catch {
          toast.error("Failed to move clip");
        }
      }
    },
    [
      clipDragState,
      selectedClipIds,
      clips,
      projectId,
      z,
      tracks,
      sampleRate,
      scrollLeft,
      scrollTop,
      pixelsPerSecond,
    ],
  );

  return {
    clipDragState,
    justFinishedDrag: justFinishedDragRef.current,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}
