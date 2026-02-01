import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { Track } from "@el-audio-daw/zero/schema";

type CreateTrackArgs = {
  projectId: string;
  name?: string;
  order: number;
  color?: string;
};

type UpdateTrackArgs = {
  id: string;
  name?: string;
  muted?: boolean;
  solo?: boolean;
  gain?: number;
  pan?: number;
  color?: string | null;
};

/**
 * Hook for managing tracks using Zero sync.
 * Provides track queries and mutations with real-time sync.
 * Zero handles optimistic updates automatically.
 */
export function useZeroTracks(projectId: string | undefined) {
  const zero = useZero();
  const [tracks] = useQuery(projectId ? queries.tracks.byProject({ projectId }) : undefined);

  const createTrack = useCallback(
    async (args: CreateTrackArgs) => {
      const id = crypto.randomUUID();
      await zero.mutate(
        mutators.tracks.create({
          id,
          projectId: args.projectId,
          name: args.name ?? `Track ${args.order + 1}`,
          order: args.order,
          color: args.color,
        }),
      );
      return id;
    },
    [zero],
  );

  const updateTrack = useCallback(
    async (args: UpdateTrackArgs) => {
      await zero.mutate(mutators.tracks.update(args));
    },
    [zero],
  );

  const deleteTrack = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.tracks.delete({ id }));
    },
    [zero],
  );

  const reorderTracks = useCallback(
    async (projectId: string, trackIds: string[]) => {
      await zero.mutate(mutators.tracks.reorder({ projectId, trackIds }));
    },
    [zero],
  );

  return {
    tracks: (tracks ?? []) as Track[],
    createTrack,
    updateTrack,
    deleteTrack,
    reorderTracks,
  };
}
