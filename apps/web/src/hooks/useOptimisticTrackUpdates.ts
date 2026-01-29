import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type TrackUpdate = { muted?: boolean; solo?: boolean; gain?: number };

type BaseTrack = {
  _id: string;
  muted: boolean;
  solo: boolean;
  gain: number;
};

/**
 * Hook for managing optimistic updates to track properties (mute, solo, gain).
 * Provides immediate UI feedback while mutations are in flight, with automatic
 * rollback on failure.
 */
export function useOptimisticTrackUpdates<T extends BaseTrack>(
  tracks: T[] | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateTrack: (args: {
    id: any;
    muted?: boolean;
    solo?: boolean;
    gain?: number;
  }) => Promise<unknown>,
) {
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, TrackUpdate>>(new Map());

  const applyOptimisticUpdate = useCallback((trackId: string, update: TrackUpdate) => {
    setOptimisticUpdates((prev) => {
      const next = new Map(prev);
      const existing = next.get(trackId) || {};
      next.set(trackId, { ...existing, ...update });
      return next;
    });
  }, []);

  const clearOptimisticUpdate = useCallback((trackId: string, keys: (keyof TrackUpdate)[]) => {
    setOptimisticUpdates((prev) => {
      const next = new Map(prev);
      const existing = next.get(trackId);
      if (!existing) return prev;

      const updated = { ...existing };
      for (const key of keys) {
        delete updated[key];
      }

      if (Object.keys(updated).length === 0) {
        next.delete(trackId);
      } else {
        next.set(trackId, updated);
      }
      return next;
    });
  }, []);

  const handleUpdateTrackMute = useCallback(
    async (trackId: string, muted: boolean) => {
      applyOptimisticUpdate(trackId, { muted });
      try {
        await updateTrack({ id: trackId, muted });
        clearOptimisticUpdate(trackId, ["muted"]);
      } catch {
        clearOptimisticUpdate(trackId, ["muted"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  const handleUpdateTrackSolo = useCallback(
    async (trackId: string, solo: boolean) => {
      applyOptimisticUpdate(trackId, { solo });
      try {
        await updateTrack({ id: trackId, solo });
        clearOptimisticUpdate(trackId, ["solo"]);
      } catch {
        clearOptimisticUpdate(trackId, ["solo"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  const handleUpdateTrackGain = useCallback(
    async (trackId: string, gain: number) => {
      applyOptimisticUpdate(trackId, { gain });
      try {
        await updateTrack({ id: trackId, gain });
        clearOptimisticUpdate(trackId, ["gain"]);
      } catch {
        clearOptimisticUpdate(trackId, ["gain"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  // Merge server tracks with optimistic updates
  const tracksWithOptimisticUpdates = useMemo(() => {
    if (!tracks) return undefined;
    return tracks.map((track) => {
      const updates = optimisticUpdates.get(track._id);
      if (!updates) return track;
      return {
        ...track,
        muted: updates.muted ?? track.muted,
        solo: updates.solo ?? track.solo,
        gain: updates.gain ?? track.gain,
      };
    });
  }, [tracks, optimisticUpdates]);

  return {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
  };
}
