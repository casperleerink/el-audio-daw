import { useCallback, useMemo } from "react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { useClipClipboard } from "@/hooks/useClipClipboard";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "./useProjectData";

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

      // Create all clips using Zero mutator
      for (const clip of clipboardData.clips) {
        await z.mutate(
          mutators.clips.create({
            id: crypto.randomUUID(),
            projectId,
            trackId: targetTrackId,
            audioFileId: clip.audioFileId,
            name: clip.name,
            startTime: playheadTimeInSamples + clip.offsetFromFirst,
            duration: clip.duration,
            audioStartTime: clip.audioStartTime,
            gain: clip.gain,
          }),
        );
      }
    },
    [hasClips, getClipboardData, sampleRate, z, projectId],
  );

  // Delete selected clips handler (FR-10 through FR-13)
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0) return;

    // Get clip IDs as array before clearing selection
    const clipIdsToDelete = Array.from(selectedClipIds);

    // Clear selection first (optimistic behavior - clips will be gone)
    clearClipSelection();

    // Delete all selected clips using Zero mutator
    for (const clipId of clipIdsToDelete) {
      await z.mutate(mutators.clips.delete({ id: clipId }));
    }
  }, [selectedClipIds, clearClipSelection, z]);

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
        // Check if playhead is within clip bounds (exclusive of edges)
        const clipEnd = clip.startTime + clip.duration;
        return playheadTimeInSamples > clip.startTime && playheadTimeInSamples < clipEnd;
      });

      // FR-44: If playhead not intersecting any selected clips, do nothing
      if (clipsToSplit.length === 0) return;

      // FR-43: Clear selection (neither resulting clip will be selected)
      clearClipSelection();

      // FR-45: Split all qualifying clips - update original and create new clip
      for (const clip of clipsToSplit) {
        const splitPoint = playheadTimeInSamples - clip.startTime;
        const newDuration = splitPoint;
        const secondClipDuration = clip.duration - splitPoint;
        const secondClipAudioStartTime = clip.audioStartTime + splitPoint;

        // Update original clip to be shorter
        await z.mutate(
          mutators.clips.update({
            id: clip.id,
            duration: newDuration,
          }),
        );

        // Create new clip for the second half
        await z.mutate(
          mutators.clips.create({
            id: crypto.randomUUID(),
            projectId,
            trackId: clip.trackId,
            audioFileId: clip.audioFileId,
            name: clip.name,
            startTime: playheadTimeInSamples,
            duration: secondClipDuration,
            audioStartTime: secondClipAudioStartTime,
            gain: clip.gain ?? 0,
          }),
        );
      }
    },
    [selectedClipIds, clips, sampleRate, clearClipSelection, z, projectId],
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
