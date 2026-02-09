import { useCallback, useMemo } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useProjectId } from "@/stores/projectStore";
import { zql } from "@el-audio-daw/zero";
import { useUndoStore } from "@/stores/undoStore";
import { createTrackCommand, reorderTracksCommand } from "@/commands/trackCommands";

export const useGetTracks = () => {
  const z = useZero();
  const projectId = useProjectId();
  const [tracks] = useQuery(
    zql.tracks.where("projectId", "=", projectId ?? "").orderBy("order", "asc"),
    {
      enabled: !!projectId,
    },
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

  const pushUndo = useUndoStore((s) => s.push);

  const addTrack = useCallback(async () => {
    if (!projectId) return;
    const trackCount = tracks.length;
    const trackData = {
      id: crypto.randomUUID(),
      projectId,
      name: `Track ${trackCount + 1}`,
      order: trackCount,
    };
    const cmd = createTrackCommand(z, trackData);
    await cmd.execute();
    pushUndo(cmd);
  }, [z, projectId, tracks.length, pushUndo]);

  const reorderTracks = useCallback(
    async (newTrackIds: string[]) => {
      if (!projectId) return;
      const cmd = reorderTracksCommand(z, projectId, trackIds, newTrackIds);
      await cmd.execute();
      pushUndo(cmd);
    },
    [z, projectId, trackIds, pushUndo],
  );

  return {
    tracks,
    trackIds,
    addTrack,
    reorderTracks,
  };
}
