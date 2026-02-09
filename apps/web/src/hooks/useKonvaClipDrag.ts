import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type Konva from "konva";
import type { Zero } from "@rocicorp/zero";
import { CLIP_PADDING, RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import type { ClipData } from "@/components/project/timeline/types";
import { useUndoStore } from "@/stores/undoStore";
import { moveClipCommand, createClipsCommand } from "@/commands/clipCommands";

interface ClipDragState {
  clipId: string;
  originalStartTime: number;
  originalTrackId: string;
  currentTrackId: string;
  currentStartTime: number;
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
}: UseKonvaClipDragOptions) {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, clipId: string, trackId: string, startTime: number) => {
      justFinishedDragRef.current = false;
      setClipDragState({
        clipId,
        originalStartTime: startTime,
        originalTrackId: trackId,
        currentTrackId: trackId,
        currentStartTime: startTime,
        isDuplicating: e.evt.altKey,
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
        // Reset Konva node to original position so the original clip stays put
        const node = e.target;
        const originalStartSeconds = state.originalStartTime / sampleRate;
        const viewStartTime = scrollLeft / pixelsPerSecond;
        const originalX = (originalStartSeconds - viewStartTime) * pixelsPerSecond;
        const originalTrackIndex = tracks.findIndex((t) => t._id === state.originalTrackId);
        const originalY =
          RULER_HEIGHT + originalTrackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING;
        node.position({ x: originalX, y: originalY });

        const timeOffset = state.currentStartTime - state.originalStartTime;
        const targetTrackId = state.currentTrackId;

        const clipsToDuplicate = selectedClipIds.has(clipId)
          ? clips.filter((c) => selectedClipIds.has(c._id))
          : clips.filter((c) => c._id === clipId);

        try {
          const clipSnapshots = clipsToDuplicate.map((clip) => {
            let newStartTime: number;
            let newTrackId: string;

            if (clip._id === clipId) {
              newStartTime = state.currentStartTime;
              newTrackId = targetTrackId;
            } else {
              newStartTime = clip.startTime + timeOffset;
              const draggedOriginalTrackIndex = tracks.findIndex(
                (t) => t._id === state.originalTrackId,
              );
              const targetTrackIndex = tracks.findIndex((t) => t._id === targetTrackId);
              const trackOffset = targetTrackIndex - draggedOriginalTrackIndex;
              const clipTrackIndex = tracks.findIndex((t) => t._id === clip.trackId);
              const newTrackIndex = Math.max(
                0,
                Math.min(tracks.length - 1, clipTrackIndex + trackOffset),
              );
              newTrackId = tracks[newTrackIndex]?._id ?? clip.trackId;
            }

            return {
              id: crypto.randomUUID(),
              projectId,
              trackId: newTrackId,
              audioFileId: clip.audioFileId,
              name: clip.name,
              startTime: Math.max(0, newStartTime),
              duration: clip.duration,
              audioStartTime: clip.audioStartTime,
              gain: 0,
            };
          });

          const cmd = createClipsCommand(z, clipSnapshots);
          await cmd.execute();
          useUndoStore.getState().push(cmd);
        } catch {
          toast.error("Failed to duplicate clip");
        }
      } else {
        try {
          const cmd = moveClipCommand(
            z,
            clipId,
            { trackId: state.originalTrackId, startTime: state.originalStartTime },
            { trackId: state.currentTrackId, startTime: state.currentStartTime },
          );
          await cmd.execute();
          useUndoStore.getState().push(cmd);
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
