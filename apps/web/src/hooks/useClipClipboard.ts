import { useCallback, useRef } from "react";

/**
 * Clipboard data for a single clip (FR-24)
 */
export interface ClipboardClipData {
  /** Audio file reference for storage */
  audioFileId: string;
  /** Clip name */
  name: string;
  /** Clip duration in samples */
  duration: number;
  /** Offset into source audio in samples */
  audioStartTime: number;
  /** Clip gain in dB */
  gain: number;
  /** Offset from first clip's start time (for maintaining relative positions) */
  offsetFromFirst: number;
}

/**
 * Full clipboard state
 */
interface ClipboardState {
  /** Clips stored in clipboard with relative positions */
  clips: ClipboardClipData[];
  /** Track ID from which clips were copied (for paste target - FR-27) */
  sourceTrackId: string;
}

interface UseClipClipboardReturn {
  /** Copy selected clips to internal clipboard (FR-23) */
  copyClips: (
    selectedClipIds: Set<string>,
    clips: Array<{
      _id: string;
      trackId: string;
      audioFileId: string;
      name: string;
      startTime: number;
      duration: number;
      audioStartTime: number;
      gain: number;
    }>,
  ) => void;
  /** Get clipboard data for paste (returns null if empty - FR-30) */
  getClipboardData: () => ClipboardState | null;
  /** Check if clipboard has clips */
  hasClips: () => boolean;
}

/**
 * Hook for managing internal clip clipboard.
 *
 * Implements FR-23 through FR-30:
 * - FR-23: Cmd+C copies selected clips to internal clipboard (not system clipboard)
 * - FR-24: Clipboard stores clip data: audioFileId, duration, audioStartTime, gain, relative positions
 * - FR-25: Cmd+V pastes clipboard contents at current playhead position
 * - FR-26: First clip aligns to playhead; other clips maintain relative offsets
 * - FR-27: Pasted clips go to same track as source clips
 * - FR-28: Paste creates new clip records (new IDs, reuses same audioFileId)
 * - FR-29: Paste uses optimistic updates with pending state
 * - FR-30: If no clips in clipboard, Cmd+V does nothing
 *
 * Clipboard persists across renders but not page refresh (per PRD technical considerations).
 */
export function useClipClipboard(): UseClipClipboardReturn {
  // Use ref to persist across renders without triggering re-renders
  const clipboardRef = useRef<ClipboardState | null>(null);

  const copyClips = useCallback(
    (
      selectedClipIds: Set<string>,
      clips: Array<{
        _id: string;
        trackId: string;
        audioFileId: string;
        name: string;
        startTime: number;
        duration: number;
        audioStartTime: number;
        gain: number;
      }>,
    ) => {
      if (selectedClipIds.size === 0) {
        return;
      }

      // Get selected clips, sorted by start time for consistent relative positioning
      const selectedClips = clips
        .filter((clip) => selectedClipIds.has(clip._id))
        .sort((a, b) => a.startTime - b.startTime);

      if (selectedClips.length === 0) {
        return;
      }

      // First clip's start time is the reference for relative positioning (FR-26)
      const firstClipStartTime = selectedClips[0]!.startTime;
      // All selected clips should be on the same track (enforced by selection hook)
      const sourceTrackId = selectedClips[0]!.trackId;

      // Build clipboard data with relative offsets
      const clipboardClips: ClipboardClipData[] = selectedClips.map((clip) => ({
        audioFileId: clip.audioFileId,
        name: clip.name,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
        offsetFromFirst: clip.startTime - firstClipStartTime,
      }));

      clipboardRef.current = {
        clips: clipboardClips,
        sourceTrackId,
      };
    },
    [],
  );

  const getClipboardData = useCallback(() => {
    return clipboardRef.current;
  }, []);

  const hasClips = useCallback(() => {
    return clipboardRef.current !== null && clipboardRef.current.clips.length > 0;
  }, []);

  return {
    copyClips,
    getClipboardData,
    hasClips,
  };
}
