import { useCallback, useMemo } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useProjectId } from "@/stores/projectStore";
import { zql } from "@el-audio-daw/zero";

export const useGetTracks = () => {
  const z = useZero();
  const projectId = useProjectId();
  const [tracks] = useQuery(
    zql.tracks.where("projectId", "=", projectId ?? "").orderBy("order", "asc"),
    {
      enabled: !!projectId,
    }
  );
  return tracks;
};

/**
 * Hook for track operations in the project editor.
 * Provides track IDs and CRUD operations.
 */
export function useProjectTracks() {
  const z = useZero();
  const projectId = useProjectId();
  const tracks = useGetTracks();
  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);

  const addTrack = useCallback(async () => {
    if (!projectId) return;
    const trackCount = tracks.length;
    await z.mutate(
      mutators.tracks.create({
        id: crypto.randomUUID(),
        projectId,
        name: `Track ${trackCount + 1}`,
        order: trackCount,
      })
    ).client;
  }, [z, projectId, tracks.length]);

  const reorderTracks = useCallback(
    async (newTrackIds: string[]) => {
      if (!projectId) return;
      await z.mutate(
        mutators.tracks.reorder({ projectId, trackIds: newTrackIds })
      ).client;
    },
    [z, projectId]
  );

  return {
    tracks,
    trackIds,
    addTrack,
    reorderTracks,
  };
}
