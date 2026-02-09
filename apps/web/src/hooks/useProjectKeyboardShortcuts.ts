import { useEffect } from "react";

interface KeyboardShortcutActions {
  /** Spacebar: toggle play/stop */
  onTogglePlayStop: () => void;
  /** Cmd+T: add track */
  onAddTrack: () => void;
  /** Escape: deselect all clips */
  onClearSelection: () => void;
  /** Cmd+A: select all on focused track */
  onSelectAllOnFocusedTrack: () => void;
  /** Delete/Backspace: delete selected clips */
  onDeleteSelectedClips: () => void;
  /** Cmd+C: copy selected clips */
  onCopyClips: () => void;
  /** Cmd+V: paste clips */
  onPasteClips: () => void;
  /** Cmd+E: split clips at playhead */
  onSplitClips: () => void;
  /** Cmd+Z: undo */
  onUndo: () => void;
  /** Cmd+Shift+Z: redo */
  onRedo: () => void;
}

/**
 * Hook for handling keyboard shortcuts in the project editor.
 *
 * Keyboard shortcuts:
 * - Space: Toggle play/stop
 * - Cmd/Ctrl+T: Add new track
 * - Escape: Clear clip selection
 * - Cmd/Ctrl+A: Select all clips on focused track
 * - Delete/Backspace: Delete selected clips
 * - Cmd/Ctrl+C: Copy selected clips
 * - Cmd/Ctrl+V: Paste clips at playhead
 * - Cmd/Ctrl+E: Split selected clips at playhead
 */
export function useProjectKeyboardShortcuts(actions: KeyboardShortcutActions): void {
  const {
    onTogglePlayStop,
    onAddTrack,
    onClearSelection,
    onSelectAllOnFocusedTrack,
    onDeleteSelectedClips,
    onCopyClips,
    onPasteClips,
    onSplitClips,
    onUndo,
    onRedo,
  } = actions;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar: toggle play/stop
      if (e.code === "Space") {
        e.preventDefault();
        onTogglePlayStop();
      }

      // Cmd+T / Ctrl+T: add track
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyT") {
        e.preventDefault();
        onAddTrack();
      }

      // FR-6: Escape deselects all clips
      if (e.code === "Escape") {
        onClearSelection();
      }

      // FR-4: Cmd+A / Ctrl+A selects all clips on focused track
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyA") {
        e.preventDefault();
        onSelectAllOnFocusedTrack();
      }

      // FR-10: Delete or Backspace deletes all selected clips
      if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        onDeleteSelectedClips();
      }

      // FR-23: Cmd+C / Ctrl+C copies selected clips to clipboard
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyC") {
        e.preventDefault();
        onCopyClips();
      }

      // FR-25: Cmd+V / Ctrl+V pastes clips at playhead position
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyV") {
        e.preventDefault();
        onPasteClips();
      }

      // FR-38: Cmd+E / Ctrl+E splits selected clips at playhead
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyE") {
        e.preventDefault();
        onSplitClips();
      }

      // Undo: Cmd+Z / Ctrl+Z (without Shift)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        onUndo();
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onTogglePlayStop,
    onAddTrack,
    onClearSelection,
    onSelectAllOnFocusedTrack,
    onDeleteSelectedClips,
    onCopyClips,
    onPasteClips,
    onSplitClips,
    onUndo,
    onRedo,
  ]);
}
