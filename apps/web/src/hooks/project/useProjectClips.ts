import { useCallback } from "react";
import { useZero } from "@rocicorp/zero/react";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { useClipClipboard } from "@/hooks/useClipClipboard";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "./useProjectData";
import { useUndoStore } from "@/stores/undoStore";
import { executeTimelineEdit } from "@/timeline-edit/executeTimelineEdit";

/**
 * Hook for clip operations in the project editor.
 * Provides clipboard operations (copy/paste), delete, and split.
 */
export function useProjectClips() {
  const z = useZero();
  const projectId = useProjectId();
  const sampleRate = useSampleRate();
  const { clips, samplesMap } = useProjectData();

  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const { clearClipSelection } = useEditorStore();
  const pushUndo = useUndoStore((s) => s.push);

  // Clipboard for copy/paste (FR-23 through FR-30)
  const { copyClips, getClipboardData, hasClips } = useClipClipboard();

  // Lookup function for Sample duration in sample frames (used by Clip trim constraints)
  const getSampleDuration = useCallback(
    (sampleId: string) => samplesMap.get(sampleId)?.durationSampleFrames,
    [samplesMap],
  );

  // Copy selected clips handler (FR-23, FR-24)
  const handleCopyClips = useCallback(() => {
    if (selectedClipIds.size === 0 || clips.length === 0) return;

    // Get full clip data for selected clips
    const clipsWithData = clips.map((clip) => ({
      _id: clip.id,
      trackId: clip.trackId,
      sampleId: clip.sampleId,
      name: clip.name,
      startSampleFrame: clip.startSampleFrame,
      durationSampleFrames: clip.durationSampleFrames,
      sourceStartSampleFrame: clip.sourceStartSampleFrame,
      gain: clip.gain ?? 0,
    }));

    copyClips(selectedClipIds, clipsWithData);
  }, [selectedClipIds, clips, copyClips]);

  // Paste clips at playhead handler (FR-25 through FR-29)
  const handlePasteClips = useCallback(
    async (playheadTime: number) => {
      // FR-30: If no clips in clipboard, do nothing
      if (!hasClips() || !projectId) return;

      const clipboardData = getClipboardData();
      if (!clipboardData || clipboardData.clips.length === 0) return;

      // Target track is the same track as source (FR-27)
      const targetTrackId = clipboardData.sourceTrackId;

      const result = await executeTimelineEdit({
        z,
        projectId,
        clips,
        selectedClipIds,
        pushUndo,
        intent: {
          type: "paste-clips-at-playhead",
          sourceTrackId: targetTrackId,
          clipboardClips: clipboardData.clips,
          playheadTime,
          sampleRate,
        },
      });
      if (result.status === "ok" && result.selectionEffect === "clear") {
        clearClipSelection();
      }
    },
    [
      hasClips,
      getClipboardData,
      sampleRate,
      clips,
      selectedClipIds,
      z,
      projectId,
      pushUndo,
      clearClipSelection,
    ],
  );

  // Delete selected clips handler (FR-10 through FR-13)
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0 || !projectId) return;

    const result = await executeTimelineEdit({
      z,
      projectId,
      clips,
      selectedClipIds,
      pushUndo,
      intent: { type: "delete-selected-clips" },
    });
    if (result.status === "ok" && result.selectionEffect === "clear") {
      clearClipSelection();
    }
  }, [selectedClipIds, clips, clearClipSelection, z, projectId, pushUndo]);

  // Split selected clips at playhead handler (FR-38 through FR-45)
  const handleSplitClips = useCallback(
    async (playheadTime: number) => {
      // FR-38: Split all selected clips at playhead position
      if (selectedClipIds.size === 0 || clips.length === 0 || !projectId) return;

      const result = await executeTimelineEdit({
        z,
        projectId,
        clips,
        selectedClipIds,
        pushUndo,
        intent: {
          type: "split-clips-at-playhead",
          playheadTime,
          sampleRate,
        },
      });

      // FR-44: If playhead not intersecting any selected clips, do nothing
      if (result.status === "blocked") return;

      // FR-43: Clear selection (neither resulting clip will be selected)
      if (result.selectionEffect === "clear") {
        clearClipSelection();
      }
    },
    [selectedClipIds, clips, sampleRate, clearClipSelection, z, projectId, pushUndo],
  );

  return {
    clips,
    getSampleDuration,
    handleCopyClips,
    handlePasteClips,
    handleDeleteSelectedClips,
    handleSplitClips,
    hasClips,
  };
}
