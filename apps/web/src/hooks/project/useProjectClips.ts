import { useCallback } from "react";
import { useZero } from "@rocicorp/zero/react";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { useClipClipboard } from "@/hooks/useClipClipboard";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "./useProjectData";
import { useUndoStore } from "@/stores/undoStore";
import { deleteClipsCommand, timelineEditPlanCommand } from "@/commands/clipCommands";
import { planPasteClips, planSplitClips, type TimelineEditClip } from "@/lib/timelineEditIntent";

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

      // Convert playhead time (seconds) to samples
      const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

      const plan = planPasteClips({
        projectId,
        clips: toTimelineEditClips(clips),
        sourceTrackId: targetTrackId,
        clipboardClips: clipboardData.clips,
        playheadSampleFrame: playheadTimeInSamples,
        createId: () => crypto.randomUUID(),
      });
      if (plan.status === "blocked") return;

      const cmd = timelineEditPlanCommand(z, "Paste Clips", plan);
      await cmd.execute();
      pushUndo(cmd);
    },
    [hasClips, getClipboardData, sampleRate, clips, z, projectId, pushUndo],
  );

  // Delete selected clips handler (FR-10 through FR-13)
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0) return;

    // Snapshot full clip data before deletion (for undo)
    const clipsToDelete = clips
      .filter((clip) => selectedClipIds.has(clip.id))
      .map((clip) => ({
        id: clip.id,
        projectId: clip.projectId,
        trackId: clip.trackId,
        sampleId: clip.sampleId,
        name: clip.name,
        startSampleFrame: clip.startSampleFrame,
        durationSampleFrames: clip.durationSampleFrames,
        sourceStartSampleFrame: clip.sourceStartSampleFrame,
        gain: clip.gain ?? 0,
      }));

    clearClipSelection();

    const cmd = deleteClipsCommand(z, clipsToDelete);
    await cmd.execute();
    pushUndo(cmd);
  }, [selectedClipIds, clips, clearClipSelection, z, pushUndo]);

  // Split selected clips at playhead handler (FR-38 through FR-45)
  const handleSplitClips = useCallback(
    async (playheadTime: number) => {
      // FR-38: Split all selected clips at playhead position
      if (selectedClipIds.size === 0 || clips.length === 0 || !projectId) return;

      // Convert playhead time (seconds) to samples
      const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

      const plan = planSplitClips({
        clips: toTimelineEditClips(clips),
        selectedClipIds,
        projectId,
        playheadSampleFrame: playheadTimeInSamples,
        createId: () => crypto.randomUUID(),
      });

      // FR-44: If playhead not intersecting any selected clips, do nothing
      if (plan.status === "blocked") return;

      // FR-43: Clear selection (neither resulting clip will be selected)
      clearClipSelection();

      const cmd = timelineEditPlanCommand(z, "Split Clips", plan);
      await cmd.execute();
      pushUndo(cmd);
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

function toTimelineEditClips(
  clips: ReadonlyArray<{
    id: string;
    projectId: string;
    trackId: string;
    sampleId: string;
    name: string;
    startSampleFrame: number;
    durationSampleFrames: number;
    sourceStartSampleFrame: number;
    gain: number | null;
  }>,
): TimelineEditClip[] {
  return clips.map((clip) => ({
    id: clip.id,
    projectId: clip.projectId,
    trackId: clip.trackId,
    sampleId: clip.sampleId,
    name: clip.name,
    startSampleFrame: clip.startSampleFrame,
    durationSampleFrames: clip.durationSampleFrames,
    sourceStartSampleFrame: clip.sourceStartSampleFrame,
    gain: clip.gain ?? 0,
  }));
}
