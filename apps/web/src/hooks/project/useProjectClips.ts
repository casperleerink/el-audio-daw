import { useCallback, useMemo } from "react";
import { useZero } from "@rocicorp/zero/react";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { useClipClipboard } from "@/hooks/useClipClipboard";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "./useProjectData";
import { useUndoStore } from "@/stores/undoStore";
import { deleteClipsCommand, createClipsCommand, splitClipCommand } from "@/commands/clipCommands";
import { compoundCommand } from "@/commands/compoundCommand";

/**
 * Hook for clip operations in the project editor.
 * Provides clipboard operations (copy/paste), delete, and split.
 */
export function useProjectClips() {
  const z = useZero();
  const projectId = useProjectId();
  const sampleRate = useSampleRate();
  const { clips, audioFilesMap } = useProjectData();

  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const { clearClipSelection } = useEditorStore();
  const pushUndo = useUndoStore((s) => s.push);

  // Clipboard for copy/paste (FR-23 through FR-30)
  const { copyClips, getClipboardData, hasClips } = useClipClipboard();

  // Lookup function for audio file duration (used by clip trim constraints)
  const getAudioFileDuration = useCallback(
    (audioFileId: string) => audioFilesMap.get(audioFileId)?.duration,
    [audioFilesMap],
  );

  // Transform clips for audio engine (map backend format to engine format)
  const clipsForEngine = useMemo(
    () =>
      clips.map((clip) => ({
        _id: clip.id,
        trackId: clip.trackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain ?? 0,
      })),
    [clips],
  );

  // Copy selected clips handler (FR-23, FR-24)
  const handleCopyClips = useCallback(() => {
    if (selectedClipIds.size === 0 || clips.length === 0) return;

    // Get full clip data for selected clips
    const clipsWithData = clips.map((clip) => ({
      _id: clip.id,
      trackId: clip.trackId,
      audioFileId: clip.audioFileId,
      name: clip.name,
      startTime: clip.startTime,
      duration: clip.duration,
      audioStartTime: clip.audioStartTime,
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

      const clipSnapshots = clipboardData.clips.map((clip) => ({
        id: crypto.randomUUID(),
        projectId,
        trackId: targetTrackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: playheadTimeInSamples + clip.offsetFromFirst,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
      }));

      const cmd = createClipsCommand(z, clipSnapshots);
      await cmd.execute();
      pushUndo(cmd);
    },
    [hasClips, getClipboardData, sampleRate, z, projectId, pushUndo],
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
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
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

      // FR-39: Find selected clips that span the playhead
      const clipsToSplit = clips.filter((clip) => {
        if (!selectedClipIds.has(clip.id)) return false;
        const clipEnd = clip.startTime + clip.duration;
        return playheadTimeInSamples > clip.startTime && playheadTimeInSamples < clipEnd;
      });

      // FR-44: If playhead not intersecting any selected clips, do nothing
      if (clipsToSplit.length === 0) return;

      // FR-43: Clear selection (neither resulting clip will be selected)
      clearClipSelection();

      const splitCommands = clipsToSplit.map((clip) => {
        const splitPoint = playheadTimeInSamples - clip.startTime;
        const newDuration = splitPoint;
        const secondClipDuration = clip.duration - splitPoint;
        const secondClipAudioStartTime = clip.audioStartTime + splitPoint;

        const originalBefore = {
          id: clip.id,
          projectId: clip.projectId,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: clip.startTime,
          duration: clip.duration,
          audioStartTime: clip.audioStartTime,
          gain: clip.gain ?? 0,
        };

        const newClip = {
          id: crypto.randomUUID(),
          projectId,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: playheadTimeInSamples,
          duration: secondClipDuration,
          audioStartTime: secondClipAudioStartTime,
          gain: clip.gain ?? 0,
        };

        return splitClipCommand(z, originalBefore, newDuration, newClip);
      });

      const cmd =
        splitCommands.length === 1
          ? splitCommands[0]!
          : compoundCommand(`Split ${splitCommands.length} Clips`, splitCommands);

      await cmd.execute();
      pushUndo(cmd);
    },
    [selectedClipIds, clips, sampleRate, clearClipSelection, z, projectId, pushUndo],
  );

  return {
    clips,
    clipsForEngine,
    getAudioFileDuration,
    handleCopyClips,
    handlePasteClips,
    handleDeleteSelectedClips,
    handleSplitClips,
    hasClips,
  };
}
