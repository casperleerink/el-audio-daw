import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { ClipAtPosition } from "./useClipDrag";

/**
 * State tracking during a trim drag operation (FR-16, FR-17)
 */
export interface TrimDragState {
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

interface UseClipTrimParams {
  pixelsPerSecond: number;
  sampleRate: number;
  projectId: string;
  findClipAtPosition: (clientX: number, clientY: number) => ClipAtPosition | null;
  trimClip: (args: {
    id: string;
    startTime: number;
    audioStartTime: number;
    duration: number;
    projectId?: string;
  }) => Promise<unknown>;
  /** Optional lookup for audio file duration. Falls back to clip.duration if not provided. */
  getAudioFileDuration?: (audioFileId: string) => number | undefined;
}

interface UseClipTrimReturn {
  /** Current trim drag state, or null if not trimming */
  trimDragState: TrimDragState | null;
  /** Whether a trim drag just finished (used to prevent click-through to seek) */
  justFinishedTrimDrag: boolean;
  /** Start trimming a clip (call on mousedown when zone is left/right) */
  handleTrimMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => boolean;
  /** Update trim during drag (call on mousemove) */
  handleTrimMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** End trim and commit changes (call on mouseup) */
  handleTrimMouseUp: () => Promise<void>;
  /** Cancel trim without committing (call on mouseleave) */
  handleTrimMouseLeave: () => void;
}

/**
 * Hook for handling clip trim functionality on the timeline.
 *
 * Implements trimming (FR-16 through FR-22):
 * - FR-16: Left handle adjusts startTime and audioStartTime together
 * - FR-17: Right handle adjusts duration only
 * - FR-18: Left trim constrained: audioStartTime >= 0
 * - FR-19: Right trim constrained: audioStartTime + duration <= audioDuration
 * - FR-20: No minimum duration (clips can be trimmed to any length > 0)
 * - FR-21: Trim operations use optimistic updates
 */
export function useClipTrim({
  pixelsPerSecond,
  sampleRate,
  projectId,
  findClipAtPosition,
  trimClip,
  getAudioFileDuration,
}: UseClipTrimParams): UseClipTrimReturn {
  const [trimDragState, setTrimDragState] = useState<TrimDragState | null>(null);
  const justFinishedTrimDragRef = useRef(false);

  // Handle mousedown for trim dragging (FR-16, FR-17)
  // Returns true if a trim was started, false otherwise
  const handleTrimMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): boolean => {
      const result = findClipAtPosition(e.clientX, e.clientY);
      if (!result) return false;

      const { clip, zone } = result;

      // Only handle trim zones (left/right), not body
      if (zone === "body") return false;

      // Pending clips are not trimmable until server confirms
      if (clip.pending) return false;

      e.preventDefault();

      // Get audioDuration from audioFiles lookup, fall back to clip.duration if not available
      // Note: audioDuration is stored in the audioFiles table, not on clips
      const audioDuration = getAudioFileDuration?.(clip.audioFileId) ?? clip.duration;

      // Start trim drag (left or right handle)
      setTrimDragState({
        clipId: clip._id,
        edge: zone,
        dragStartX: e.clientX,
        originalStartTime: clip.startTime,
        originalAudioStartTime: clip.audioStartTime,
        originalDuration: clip.duration,
        audioDuration,
        currentStartTime: clip.startTime,
        currentAudioStartTime: clip.audioStartTime,
        currentDuration: clip.duration,
      });

      return true;
    },
    [findClipAtPosition, getAudioFileDuration],
  );

  // Handle mousemove for trim dragging
  const handleTrimMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!trimDragState) return;

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
    },
    [trimDragState, pixelsPerSecond, sampleRate],
  );

  // Handle mouseup for trim commit (FR-21)
  const handleTrimMouseUp = useCallback(async () => {
    if (!trimDragState) return;

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

    // Clear trim state immediately to prevent further mouse moves from updating it
    setTrimDragState(null);

    if (hasChanged) {
      // Mark that we just finished a trim drag to prevent click from seeking
      justFinishedTrimDragRef.current = true;
      requestAnimationFrame(() => {
        justFinishedTrimDragRef.current = false;
      });

      try {
        await trimClip({
          id: clipId,
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
  }, [trimDragState, projectId, trimClip]);

  // Handle mouse leave to cancel trim drag (FR-37)
  const handleTrimMouseLeave = useCallback(() => {
    if (trimDragState) {
      setTrimDragState(null);
    }
  }, [trimDragState]);

  return {
    trimDragState,
    justFinishedTrimDrag: justFinishedTrimDragRef.current,
    handleTrimMouseDown,
    handleTrimMouseMove,
    handleTrimMouseUp,
    handleTrimMouseLeave,
  };
}
