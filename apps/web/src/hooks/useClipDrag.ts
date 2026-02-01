import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import {
  calculateTimeFromX,
  calculateTrackIndexFromY,
  clientToCanvasPosition,
  isInTrackArea,
  samplesToSeconds,
} from "@/lib/timelineCalculations";
import { TRIM_HANDLE_WIDTH } from "@/lib/timelineConstants";

/**
 * Describes which part of a clip is being hovered
 */
export type ClipHoverZone = "left" | "right" | "body";

/**
 * Clip data structure for drag operations
 */
export interface ClipData {
  _id: string;
  trackId: string;
  audioFileId: string; // Changed from fileId
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // offset into source audio in samples
  pending?: boolean; // true if clip is awaiting server confirmation
}

/**
 * Track data structure for clip drag calculations
 */
interface TrackData {
  _id: string;
}

/**
 * Layout parameters for position calculations
 */
interface LayoutParams {
  rulerHeight: number;
  trackHeight: number;
  clipPadding: number;
}

/**
 * State tracking during a clip drag operation
 * Supports both horizontal (time) and vertical (track) movement
 */
export interface ClipDragState {
  clipId: string;
  originalStartTime: number; // in samples
  currentStartTime: number; // in samples (updated during drag)
  dragStartX: number; // initial mouse X position
  dragStartY: number; // initial mouse Y position (for cross-track drag)
  originalTrackId: string; // track at drag start
  currentTrackId: string; // target track (updated during drag)
}

interface UseClipDragParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  tracks: TrackData[];
  clips: ClipData[];
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  layoutParams: LayoutParams;
  projectId: string;
  updateClipPosition: (args: {
    id: string;
    startTime: number;
    trackId?: string;
    projectId?: string;
  }) => Promise<unknown>;
}

/**
 * Result of finding a clip at a position, including which zone is hovered
 */
export interface ClipAtPosition {
  clip: ClipData;
  zone: ClipHoverZone;
}

interface UseClipDragReturn {
  /** Current drag state, or null if not dragging */
  clipDragState: ClipDragState | null;
  /** Whether a drag just finished (used to prevent click-through to seek) */
  justFinishedDrag: boolean;
  /** Find a clip at the given client coordinates - returns clip and hover zone */
  findClipAtPosition: (clientX: number, clientY: number) => ClipAtPosition | null;
  /** Start dragging a clip (call on mousedown) - returns true if drag started */
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => boolean;
  /** Update clip position during drag (call on mousemove) */
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** End drag and commit changes (call on mouseup) */
  handleMouseUp: () => Promise<void>;
  /** Cancel drag without committing (call on mouseleave) */
  handleMouseLeave: () => void;
}

/**
 * Hook for handling clip drag-to-move functionality on the timeline.
 *
 * Implements clip movement (FR-34 through FR-38):
 * - FR-34: Click and drag clips to move them
 * - FR-35: Visual feedback during drag (ghost position)
 * - FR-36: Commit position on mouse release
 * - FR-37: Cancel on mouse leave
 * - FR-38: Clamp to timeline start (time >= 0)
 *
 * Note: Trim functionality has been extracted to useClipTrim hook.
 */
export function useClipDrag({
  canvasRef,
  tracks,
  clips,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  layoutParams,
  projectId,
  updateClipPosition,
}: UseClipDragParams): UseClipDragReturn {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  const { rulerHeight, trackHeight, clipPadding } = layoutParams;

  // Find clip at mouse position (for drag-to-move and trim detection)
  // FR-14: Returns which zone is hovered (left/right trim handles or body)
  const findClipAtPosition = useCallback(
    (clientX: number, clientY: number): ClipAtPosition | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || tracks.length === 0) return null;

      const { canvasX, canvasY } = clientToCanvasPosition(clientX, clientY, rect);

      // Check if in track area (below ruler)
      if (!isInTrackArea(canvasY, rulerHeight)) return null;

      // Calculate track index from Y position
      const layoutCalcParams = {
        rulerHeight,
        trackHeight,
        scrollTop,
        scrollLeft,
        pixelsPerSecond,
      };
      const trackIndex = calculateTrackIndexFromY(canvasY, layoutCalcParams);
      if (trackIndex < 0 || trackIndex >= tracks.length) return null;

      const track = tracks[trackIndex];
      if (!track) return null;

      // Calculate time from X position (in seconds for comparison)
      const timeInSeconds = calculateTimeFromX(canvasX, layoutCalcParams);

      // Find a clip at this position
      for (const clip of clips) {
        if (clip.trackId !== track._id) continue;

        const clipStartSeconds = samplesToSeconds(clip.startTime, sampleRate);
        const clipDurationSeconds = samplesToSeconds(clip.duration, sampleRate);
        const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

        // Check if click is within clip's time range
        if (timeInSeconds >= clipStartSeconds && timeInSeconds <= clipEndSeconds) {
          // Check if click is within clip's vertical bounds
          const trackY = rulerHeight + trackIndex * trackHeight - scrollTop;
          const clipY = trackY + clipPadding;
          const clipHeight = trackHeight - clipPadding * 2 - 1;

          if (canvasY >= clipY && canvasY <= clipY + clipHeight) {
            // Calculate clip pixel boundaries for trim handle detection (FR-14)
            const startTime = scrollLeft / pixelsPerSecond;
            const clipX = (clipStartSeconds - startTime) * pixelsPerSecond;
            const clipWidth = clipDurationSeconds * pixelsPerSecond;

            // Determine which zone is hovered
            const relativeX = canvasX - clipX;
            let zone: ClipHoverZone = "body";

            // Only show trim handles if clip is wide enough (at least 2x handle width)
            if (clipWidth >= TRIM_HANDLE_WIDTH * 2) {
              if (relativeX <= TRIM_HANDLE_WIDTH) {
                zone = "left";
              } else if (relativeX >= clipWidth - TRIM_HANDLE_WIDTH) {
                zone = "right";
              }
            }

            return { clip, zone };
          }
        }
      }

      return null;
    },
    [
      canvasRef,
      tracks,
      clips,
      scrollLeft,
      scrollTop,
      pixelsPerSecond,
      sampleRate,
      rulerHeight,
      trackHeight,
      clipPadding,
    ],
  );

  // Handle mousedown for clip dragging (FR-34)
  // Returns true if a drag was started, false otherwise
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): boolean => {
      const result = findClipAtPosition(e.clientX, e.clientY);
      if (!result) return false;

      const { clip, zone } = result;

      // Only handle body zone for movement, trim zones are handled by useClipTrim
      if (zone !== "body") return false;

      // Pending clips are not draggable until server confirms
      if (clip.pending) return false;

      e.preventDefault();

      // Start clip move drag (horizontal and vertical)
      setClipDragState({
        clipId: clip._id,
        originalStartTime: clip.startTime,
        currentStartTime: clip.startTime,
        dragStartX: e.clientX,
        dragStartY: e.clientY,
        originalTrackId: clip.trackId,
        currentTrackId: clip.trackId,
      });

      return true;
    },
    [findClipAtPosition],
  );

  // Handle mousemove for clip dragging (FR-35, FR-31)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!clipDragState) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate horizontal movement (FR-36)
      const deltaX = e.clientX - clipDragState.dragStartX;
      const deltaTimeInSeconds = deltaX / pixelsPerSecond;
      const deltaTimeInSamples = deltaTimeInSeconds * sampleRate;

      // Calculate new start time (clamp to 0 per FR-38)
      const newStartTime = Math.max(0, clipDragState.originalStartTime + deltaTimeInSamples);

      // Calculate vertical movement for cross-track drag (FR-31, FR-32)
      const { canvasY } = clientToCanvasPosition(e.clientX, e.clientY, rect);
      const layoutCalcParams = {
        rulerHeight,
        trackHeight,
        scrollTop,
        scrollLeft,
        pixelsPerSecond,
      };
      const targetTrackIndex = calculateTrackIndexFromY(canvasY, layoutCalcParams);

      // Snap to valid track (FR-32)
      let targetTrackId = clipDragState.originalTrackId;
      if (targetTrackIndex >= 0 && targetTrackIndex < tracks.length) {
        const targetTrack = tracks[targetTrackIndex];
        if (targetTrack) {
          targetTrackId = targetTrack._id;
        }
      }

      setClipDragState((prev) =>
        prev
          ? {
              ...prev,
              currentStartTime: Math.round(newStartTime),
              currentTrackId: targetTrackId,
            }
          : null,
      );
    },
    [
      clipDragState,
      pixelsPerSecond,
      sampleRate,
      canvasRef,
      tracks,
      rulerHeight,
      trackHeight,
      scrollTop,
      scrollLeft,
    ],
  );

  // Handle mouseup for clip dragging (FR-36)
  const handleMouseUp = useCallback(async () => {
    if (!clipDragState) return;

    const { clipId, originalStartTime, currentStartTime, originalTrackId, currentTrackId } =
      clipDragState;

    // Only update if position or track changed
    const positionChanged = currentStartTime !== originalStartTime;
    const trackChanged = currentTrackId !== originalTrackId;

    // Clear drag state immediately to prevent further mouse moves from updating it
    setClipDragState(null);

    if (positionChanged || trackChanged) {
      // Mark that we just finished a drag to prevent click from seeking
      // Only set this when actual movement occurred (not just a click)
      justFinishedDragRef.current = true;
      // Reset the flag on next tick
      requestAnimationFrame(() => {
        justFinishedDragRef.current = false;
      });

      try {
        await updateClipPosition({
          id: clipId,
          startTime: currentStartTime,
          // Only include trackId if it changed (FR-35)
          ...(trackChanged && { trackId: currentTrackId }),
          projectId,
        });
      } catch (error) {
        console.error("Failed to update clip position:", error);
        toast.error("Failed to move clip. Changes reverted.");
      }
    }
  }, [clipDragState, projectId, updateClipPosition]);

  // Handle mouse leave to cancel clip drag (FR-37)
  const handleMouseLeave = useCallback(() => {
    if (clipDragState) {
      setClipDragState(null);
    }
  }, [clipDragState]);

  return {
    clipDragState,
    justFinishedDrag: justFinishedDragRef.current,
    findClipAtPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}
