import { useCallback, useState } from "react";

/**
 * Selection state for clips on the timeline.
 *
 * Selection is scoped to a single track - selecting clips on a different track
 * clears the previous selection (FR-3).
 */
interface ClipSelectionState {
  /** Set of selected clip IDs */
  selectedClipIds: Set<string>;
  /** Track ID that currently has focus (for Cmd+A) */
  focusedTrackId: string | null;
}

interface UseClipSelectionParams {
  /** All clips available for selection */
  clips: Array<{
    _id: string;
    trackId: string;
    pending?: boolean;
  }>;
}

interface UseClipSelectionReturn {
  /** Set of currently selected clip IDs */
  selectedClipIds: Set<string>;
  /** Currently focused track ID (for Cmd+A and visual indicator) */
  focusedTrackId: string | null;
  /** Select a single clip, deselecting others (FR-1) */
  selectClip: (clipId: string, trackId: string) => void;
  /** Toggle clip in selection with shift key (FR-2, FR-3) */
  toggleClipSelection: (clipId: string, trackId: string) => void;
  /** Deselect all clips (FR-5, FR-6) */
  clearSelection: () => void;
  /** Select all clips on the focused track (FR-4) */
  selectAllOnFocusedTrack: () => void;
  /** Set focused track without changing selection */
  setFocusedTrack: (trackId: string) => void;
  /** Check if a clip is selected */
  isSelected: (clipId: string) => boolean;
}

/**
 * Hook for managing clip selection state on the timeline.
 *
 * Implements FR-1 through FR-9:
 * - FR-1: Click on clip selects it and deselects all others
 * - FR-2: Shift+click on clip adds/removes it from selection
 * - FR-3: Selection limited to single track
 * - FR-4: Cmd+A selects all clips on focused track
 * - FR-5: Click on empty area deselects all clips
 * - FR-6: Escape key deselects all clips
 * - FR-7: Selected clips display visual highlight (handled in renderer)
 * - FR-8: Pending clips cannot be selected
 * - FR-9: Focused track displays visual indicator (handled in UI)
 */
export function useClipSelection({ clips }: UseClipSelectionParams): UseClipSelectionReturn {
  const [state, setState] = useState<ClipSelectionState>({
    selectedClipIds: new Set(),
    focusedTrackId: null,
  });

  // Get clip by ID
  const getClip = useCallback((clipId: string) => clips.find((c) => c._id === clipId), [clips]);

  // Check if clip is pending (FR-8)
  const isPendingClip = useCallback(
    (clipId: string) => {
      const clip = getClip(clipId);
      return clip?.pending === true;
    },
    [getClip],
  );

  // Select a single clip (FR-1)
  const selectClip = useCallback(
    (clipId: string, trackId: string) => {
      // FR-8: Pending clips cannot be selected
      if (isPendingClip(clipId)) {
        return;
      }

      setState({
        selectedClipIds: new Set([clipId]),
        focusedTrackId: trackId,
      });
    },
    [isPendingClip],
  );

  // Toggle clip in selection with shift (FR-2, FR-3)
  const toggleClipSelection = useCallback(
    (clipId: string, trackId: string) => {
      // FR-8: Pending clips cannot be selected
      if (isPendingClip(clipId)) {
        return;
      }

      setState((prev) => {
        // FR-3: If clicking on a different track, clear selection and select new clip
        if (prev.focusedTrackId !== null && prev.focusedTrackId !== trackId) {
          return {
            selectedClipIds: new Set([clipId]),
            focusedTrackId: trackId,
          };
        }

        // FR-2: Add or remove clip from selection
        const newSelectedIds = new Set(prev.selectedClipIds);
        if (newSelectedIds.has(clipId)) {
          newSelectedIds.delete(clipId);
        } else {
          newSelectedIds.add(clipId);
        }

        return {
          selectedClipIds: newSelectedIds,
          focusedTrackId: trackId,
        };
      });
    },
    [isPendingClip],
  );

  // Deselect all clips (FR-5, FR-6)
  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedClipIds: new Set(),
    }));
  }, []);

  // Select all clips on focused track (FR-4)
  const selectAllOnFocusedTrack = useCallback(() => {
    setState((prev) => {
      if (!prev.focusedTrackId) {
        return prev;
      }

      // Get all non-pending clips on the focused track
      const trackClipIds = clips
        .filter((clip) => clip.trackId === prev.focusedTrackId && !clip.pending)
        .map((clip) => clip._id);

      return {
        ...prev,
        selectedClipIds: new Set(trackClipIds),
      };
    });
  }, [clips]);

  // Set focused track without changing selection
  const setFocusedTrack = useCallback((trackId: string) => {
    setState((prev) => ({
      ...prev,
      focusedTrackId: trackId,
    }));
  }, []);

  // Check if a clip is selected
  const isSelected = useCallback(
    (clipId: string) => state.selectedClipIds.has(clipId),
    [state.selectedClipIds],
  );

  return {
    selectedClipIds: state.selectedClipIds,
    focusedTrackId: state.focusedTrackId,
    selectClip,
    toggleClipSelection,
    clearSelection,
    selectAllOnFocusedTrack,
    setFocusedTrack,
    isSelected,
  };
}
