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
 *
 * For mute/solo: immediate update + server mutation (single action)
 * For gain: separate local update vs commit (for continuous slider interactions)
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

  // Handler for immediate update + server mutation (mute/solo)
  const createImmediateUpdateHandler = useCallback(
    <K extends keyof TrackUpdate>(key: K) =>
      async (trackId: string, value: NonNullable<TrackUpdate[K]>) => {
        applyOptimisticUpdate(trackId, { [key]: value } as TrackUpdate);
        try {
          await updateTrack({ id: trackId, [key]: value });
        } catch {
          toast.error("Failed to update track");
        } finally {
          clearOptimisticUpdate(trackId, [key]);
        }
      },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  const handleUpdateTrackMute = useMemo(
    () => createImmediateUpdateHandler("muted"),
    [createImmediateUpdateHandler],
  );
  const handleUpdateTrackSolo = useMemo(
    () => createImmediateUpdateHandler("solo"),
    [createImmediateUpdateHandler],
  );

  // Gain handlers: separate local update from server commit
  // This enables real-time audio feedback during slider drag

  /** Apply local optimistic update for gain (no server call) - use for real-time feedback */
  const handleUpdateTrackGain = useCallback(
    (trackId: string, value: number) => {
      applyOptimisticUpdate(trackId, { gain: value });
    },
    [applyOptimisticUpdate],
  );

  /** Commit gain to server (on slider release) - clears optimistic state on completion */
  const handleCommitTrackGain = useCallback(
    async (trackId: string, value: number) => {
      try {
        await updateTrack({ id: trackId, gain: value });
      } catch {
        toast.error("Failed to update track gain");
      } finally {
        clearOptimisticUpdate(trackId, ["gain"]);
      }
    },
    [updateTrack, clearOptimisticUpdate],
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
    handleCommitTrackGain,
  };
}
