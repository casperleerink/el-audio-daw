import { create } from "zustand";

interface Clip {
  id: string;
  trackId: string;
  pending?: boolean;
}

interface EditorState {
  // Track selection (determines effects panel visibility)
  selectedTrackId: string | null;

  // Clip selection (scoped to single track)
  selectedClipIds: Set<string>;
  focusedTrackId: string | null;

  // Effect selection within effects panel
  selectedEffectId: string | null;
}

interface EditorActions {
  // Track selection
  selectTrack: (trackId: string | null) => void;

  // Clip selection
  selectClip: (clipId: string, trackId: string, isPending?: boolean) => void;
  toggleClipSelection: (clipId: string, trackId: string, isPending?: boolean) => void;
  clearClipSelection: () => void;
  selectAllOnTrack: (clips: Clip[]) => void;
  setFocusedTrack: (trackId: string) => void;

  // Effect selection
  selectEffect: (effectId: string | null) => void;
}

type EditorStore = EditorState & EditorActions;

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial state
  selectedTrackId: null,
  selectedClipIds: new Set(),
  focusedTrackId: null,
  selectedEffectId: null,

  // Track selection
  selectTrack: (trackId) => {
    set({
      selectedTrackId: trackId,
      // Clear effect selection when changing tracks
      selectedEffectId: null,
    });
  },

  // Select single clip, deselect others
  selectClip: (clipId, trackId, isPending = false) => {
    if (isPending) return;

    set({
      selectedClipIds: new Set([clipId]),
      focusedTrackId: trackId,
    });
  },

  // Toggle clip in selection (shift+click)
  toggleClipSelection: (clipId, trackId, isPending = false) => {
    if (isPending) return;

    const { focusedTrackId, selectedClipIds } = get();

    // If clicking on different track, clear and select new clip
    if (focusedTrackId !== null && focusedTrackId !== trackId) {
      set({
        selectedClipIds: new Set([clipId]),
        focusedTrackId: trackId,
      });
      return;
    }

    // Add or remove from selection
    const newSelectedIds = new Set(selectedClipIds);
    if (newSelectedIds.has(clipId)) {
      newSelectedIds.delete(clipId);
    } else {
      newSelectedIds.add(clipId);
    }

    set({
      selectedClipIds: newSelectedIds,
      focusedTrackId: trackId,
    });
  },

  // Clear all clip selection
  clearClipSelection: () => {
    set({ selectedClipIds: new Set() });
  },

  // Select all clips on focused track
  selectAllOnTrack: (clips) => {
    const { focusedTrackId } = get();
    if (!focusedTrackId) return;

    const trackClipIds = clips
      .filter((clip) => clip.trackId === focusedTrackId && !clip.pending)
      .map((clip) => clip.id);

    set({ selectedClipIds: new Set(trackClipIds) });
  },

  // Set focused track without changing selection
  setFocusedTrack: (trackId) => {
    set({ focusedTrackId: trackId });
  },

  // Effect selection
  selectEffect: (effectId) => {
    set({ selectedEffectId: effectId });
  },
}));

// Selectors for common derived state
export const useSelectedTrackId = () => useEditorStore((s) => s.selectedTrackId);
export const useSelectedClipIds = () => useEditorStore((s) => s.selectedClipIds);
export const useFocusedTrackId = () => useEditorStore((s) => s.focusedTrackId);
export const useSelectedEffectId = () => useEditorStore((s) => s.selectedEffectId);
export const useIsEffectsPanelOpen = () => useEditorStore((s) => s.selectedTrackId !== null);
