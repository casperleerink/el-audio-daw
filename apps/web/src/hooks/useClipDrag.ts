import type { Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
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
  fileId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // offset into source audio in samples
  audioDuration: number; // original audio file duration in samples
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

/**
 * State tracking during a trim drag operation (FR-16, FR-17)
 */
interface TrimDragState {
  clipId: string;
  edge: "left" | "right";
  dragStartX: number;
  // Original values at drag start
  originalStartTime: number;
  originalAudioStartTime: number;
  originalDuration: number;
  audioDuration: number; // For constraint validation
  // Current values during drag
  currentStartTime: number;
  currentAudioStartTime: number;
  currentDuration: number;
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
  projectId: Id<"projects">;
  updateClipPosition: (args: {
    id: Id<"clips">;
    startTime: number;
    trackId?: Id<"tracks">;
    projectId?: Id<"projects">;
  }) => Promise<unknown>;
  trimClip: (args: {
    id: Id<"clips">;
    startTime: number;
    audioStartTime: number;
    duration: number;
    projectId?: Id<"projects">;
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
  /** Current trim drag state, or null if not trimming */
  trimDragState: TrimDragState | null;
  /** Whether a drag just finished (used to prevent click-through to seek) */
  justFinishedDrag: boolean;
  /** Find a clip at the given client coordinates - returns clip and hover zone */
  findClipAtPosition: (clientX: number, clientY: number) => ClipAtPosition | null;
  /** Start dragging a clip (call on mousedown) */
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Update clip position during drag (call on mousemove) */
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** End drag and commit changes (call on mouseup) */
  handleMouseUp: () => void;
  /** Cancel drag without committing (call on mouseleave) */
  handleMouseLeave: () => void;
}

/**
 * Hook for handling clip drag-to-move and trim functionality on the timeline.
 *
 * Implements clip movement (FR-34 through FR-38):
 * - FR-34: Click and drag clips to move them
 * - FR-35: Visual feedback during drag (ghost position)
 * - FR-36: Commit position on mouse release
 * - FR-37: Cancel on mouse leave
 * - FR-38: Clamp to timeline start (time >= 0)
 *
 * Implements trimming (FR-16 through FR-22):
 * - FR-16: Left handle adjusts startTime and audioStartTime together
 * - FR-17: Right handle adjusts duration only
 * - FR-18: Left trim constrained: audioStartTime >= 0
 * - FR-19: Right trim constrained: audioStartTime + duration <= audioDuration
 * - FR-20: No minimum duration (clips can be trimmed to any length > 0)
 * - FR-21: Trim operations use optimistic updates
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
  trimClip,
}: UseClipDragParams): UseClipDragReturn {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const [trimDragState, setTrimDragState] = useState<TrimDragState | null>(null);
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

  // Handle mousedown for clip dragging (FR-34) or trim dragging (FR-16, FR-17)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Check if clicking on a clip
      const result = findClipAtPosition(e.clientX, e.clientY);
      if (result) {
        const { clip, zone } = result;
        // Pending clips are not draggable/trimmable until server confirms
        if (clip.pending) {
          return;
        }

        e.preventDefault();

        if (zone === "body") {
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
        } else {
          // Start trim drag (left or right handle)
          setTrimDragState({
            clipId: clip._id,
            edge: zone,
            dragStartX: e.clientX,
            originalStartTime: clip.startTime,
            originalAudioStartTime: clip.audioStartTime,
            originalDuration: clip.duration,
            audioDuration: clip.audioDuration,
            currentStartTime: clip.startTime,
            currentAudioStartTime: clip.audioStartTime,
            currentDuration: clip.duration,
          });
        }
      }
    },
    [findClipAtPosition],
  );

  // Handle mousemove for clip dragging (FR-35, FR-31) or trim dragging (FR-16, FR-17)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Handle clip move drag (horizontal and vertical)
      if (clipDragState) {
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
        return;
      }

      // Handle trim drag
      if (trimDragState) {
        const deltaX = e.clientX - trimDragState.dragStartX;
        const deltaTimeInSeconds = deltaX / pixelsPerSecond;
        const deltaTimeInSamples = Math.round(deltaTimeInSeconds * sampleRate);

        if (trimDragState.edge === "left") {
          // Left trim: adjust startTime and audioStartTime together (FR-16)
          // Moving left handle right = increasing audioStartTime, decreasing duration
          // Moving left handle left = decreasing audioStartTime, increasing duration
          let newAudioStartTime = trimDragState.originalAudioStartTime + deltaTimeInSamples;
          let newStartTime = trimDragState.originalStartTime + deltaTimeInSamples;
          let newDuration = trimDragState.originalDuration - deltaTimeInSamples;

          // Constraint FR-18: audioStartTime >= 0
          if (newAudioStartTime < 0) {
            const adjustment = -newAudioStartTime;
            newAudioStartTime = 0;
            newStartTime = trimDragState.originalStartTime + deltaTimeInSamples + adjustment;
            newDuration = trimDragState.originalDuration - deltaTimeInSamples - adjustment;
          }

          // Constraint: startTime >= 0
          if (newStartTime < 0) {
            const adjustment = -newStartTime;
            newStartTime = 0;
            newAudioStartTime =
              trimDragState.originalAudioStartTime + deltaTimeInSamples + adjustment;
            newDuration = trimDragState.originalDuration - deltaTimeInSamples - adjustment;
          }

          // Constraint FR-20: duration > 0 (minimum 1 sample)
          if (newDuration < 1) {
            newDuration = 1;
            const actualDelta = trimDragState.originalDuration - 1;
            newAudioStartTime = trimDragState.originalAudioStartTime + actualDelta;
            newStartTime = trimDragState.originalStartTime + actualDelta;
          }

          setTrimDragState((prev) =>
            prev
              ? {
                  ...prev,
                  currentStartTime: newStartTime,
                  currentAudioStartTime: newAudioStartTime,
                  currentDuration: newDuration,
                }
              : null,
          );
        } else {
          // Right trim: adjust duration only (FR-17)
          // Moving right handle right = increasing duration
          // Moving right handle left = decreasing duration
          let newDuration = trimDragState.originalDuration + deltaTimeInSamples;

          // Constraint FR-19: audioStartTime + duration <= audioDuration
          const maxDuration = trimDragState.audioDuration - trimDragState.originalAudioStartTime;
          if (newDuration > maxDuration) {
            newDuration = maxDuration;
          }

          // Constraint FR-20: duration > 0 (minimum 1 sample)
          if (newDuration < 1) {
            newDuration = 1;
          }

          setTrimDragState((prev) =>
            prev
              ? {
                  ...prev,
                  currentDuration: newDuration,
                }
              : null,
          );
        }
      }
    },
    [
      clipDragState,
      trimDragState,
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

  // Handle mouseup for clip dragging (FR-36) or trim commit (FR-21)
  const handleMouseUp = useCallback(async () => {
    // Handle clip move drag commit (horizontal and cross-track)
    if (clipDragState) {
      const { clipId, originalStartTime, currentStartTime, originalTrackId, currentTrackId } =
        clipDragState;

      // Only update if position or track changed
      const positionChanged = currentStartTime !== originalStartTime;
      const trackChanged = currentTrackId !== originalTrackId;

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
            id: clipId as Id<"clips">,
            startTime: currentStartTime,
            // Only include trackId if it changed (FR-35)
            ...(trackChanged && { trackId: currentTrackId as Id<"tracks"> }),
            projectId,
          });
        } catch (error) {
          console.error("Failed to update clip position:", error);
          toast.error("Failed to move clip. Changes reverted.");
        }
      }

      setClipDragState(null);
      return;
    }

    // Handle trim drag commit (FR-21)
    if (trimDragState) {
      const {
        clipId,
        originalStartTime,
        originalAudioStartTime,
        originalDuration,
        currentStartTime,
        currentAudioStartTime,
        currentDuration,
      } = trimDragState;

      // Only update if something changed
      const hasChanged =
        currentStartTime !== originalStartTime ||
        currentAudioStartTime !== originalAudioStartTime ||
        currentDuration !== originalDuration;

      if (hasChanged) {
        // Mark that we just finished a trim drag to prevent click from seeking
        justFinishedDragRef.current = true;
        requestAnimationFrame(() => {
          justFinishedDragRef.current = false;
        });

        try {
          await trimClip({
            id: clipId as Id<"clips">,
            startTime: currentStartTime,
            audioStartTime: currentAudioStartTime,
            duration: currentDuration,
            projectId,
          });
        } catch (error) {
          console.error("Failed to trim clip:", error);
          toast.error("Failed to trim clip. Changes reverted.");
        }
      }

      setTrimDragState(null);
    }
  }, [clipDragState, trimDragState, projectId, updateClipPosition, trimClip]);

  // Handle mouse leave to cancel clip drag or trim drag (FR-37)
  const handleMouseLeave = useCallback(() => {
    // Cancel any drag on mouse leave (don't commit changes)
    if (clipDragState) {
      setClipDragState(null);
    }
    if (trimDragState) {
      setTrimDragState(null);
    }
  }, [clipDragState, trimDragState]);

  return {
    clipDragState,
    trimDragState,
    justFinishedDrag: justFinishedDragRef.current,
    findClipAtPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}
