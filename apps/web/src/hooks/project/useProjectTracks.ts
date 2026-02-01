import { useCallback, useMemo } from "react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useProjectId } from "@/stores/projectStore";
import { useOptimisticTrackUpdates } from "@/hooks/useOptimisticTrackUpdates";
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";
import { useProjectData } from "./useProjectData";

/**
 * Hook for track operations in the project editor.
 * Provides CRUD operations and optimistic updates for tracks.
 */
export function useProjectTracks() {
  const z = useZero();
  const projectId = useProjectId();
  const { tracks } = useProjectData();

  // Zero mutation wrapper for track updates (used by useOptimisticTrackUpdates)
  const updateTrack = useCallback(
    async (args: { id: string; muted?: boolean; solo?: boolean; gain?: number; pan?: number }) => {
      const { id: trackId, ...updates } = args;
      await z.mutate(mutators.tracks.update({ id: trackId, ...updates })).client;
    },
    [z],
  );

  // Transform tracks to match expected format for useOptimisticTrackUpdates
  const tracksForOptimistic = useMemo(
    () =>
      tracks.map((t) => ({
        _id: t.id,
        muted: t.muted ?? false,
        solo: t.solo ?? false,
        gain: t.gain ?? 0,
        pan: t.pan ?? 0,
        name: t.name,
        order: t.order,
        color: t.color,
        projectId: t.projectId,
      })),
    [tracks],
  );

  const {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  } = useOptimisticTrackUpdates(tracksForOptimistic, updateTrack, projectId ?? undefined);

  // Add track handler
  const addTrack = useCallback(async () => {
    if (!projectId) return;
    const trackCount = tracks.length;
    await z.mutate(
      mutators.tracks.create({
        id: crypto.randomUUID(),
        projectId,
        name: `Track ${trackCount + 1}`,
        order: trackCount,
      }),
    );
  }, [z, projectId, tracks.length]);

  // Update track name handler
  const updateTrackName = useCallback(
    async (trackId: string, name: string) => {
      await z.mutate(mutators.tracks.update({ id: trackId, name }));
    },
    [z],
  );

  // Delete track handler
  const deleteTrack = useCallback(
    async (trackId: string) => {
      // Cancel any pending uploads for this track before deletion (FR-7)
      cancelUploadsForTrack(trackId);
      await z.mutate(mutators.tracks.delete({ id: trackId }));
    },
    [z],
  );

  // Reorder tracks handler
  const reorderTracks = useCallback(
    async (trackIds: string[]) => {
      if (!projectId) return;
      await z.mutate(mutators.tracks.reorder({ projectId, trackIds }));
    },
    [z, projectId],
  );

  return {
    tracks,
    tracksWithOptimisticUpdates,
    addTrack,
    updateTrackName,
    deleteTrack,
    reorderTracks,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  };
}
