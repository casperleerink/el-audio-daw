import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type TrackUpdate = { muted?: boolean; solo?: boolean; gain?: number; pan?: number };

type BaseTrack = {
  _id: string;
  muted: boolean;
  solo: boolean;
  gain: number;
  pan?: number;
};

/**
 * Hook for managing optimistic updates to track properties (mute, solo, gain, pan).
 * Provides immediate UI feedback while mutations are in flight, with automatic
 * rollback on failure.
 *
 * For mute/solo: immediate update + server mutation (single action)
 * For gain/pan: separate local update vs commit (for continuous slider/knob interactions)
 */
export function useOptimisticTrackUpdates<T extends BaseTrack>(
  tracks: T[] | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateTrack: (args: {
    id: any;
    projectId?: any;
    muted?: boolean;
    solo?: boolean;
    gain?: number;
    pan?: number;
  }) => Promise<unknown>,
  projectId?: string,
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
          await updateTrack({ id: trackId, projectId, [key]: value });
        } catch {
          toast.error("Failed to update track");
        } finally {
          clearOptimisticUpdate(trackId, [key]);
        }
      },
    [updateTrack, projectId, applyOptimisticUpdate, clearOptimisticUpdate],
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
        await updateTrack({ id: trackId, projectId, gain: value });
      } catch {
        toast.error("Failed to update track gain");
      } finally {
        clearOptimisticUpdate(trackId, ["gain"]);
      }
    },
    [updateTrack, projectId, clearOptimisticUpdate],
  );

  // Pan handlers: separate local update from server commit
  // This enables real-time audio feedback during knob drag

  /** Apply local optimistic update for pan (no server call) - use for real-time feedback */
  const handleUpdateTrackPan = useCallback(
    (trackId: string, value: number) => {
      applyOptimisticUpdate(trackId, { pan: value });
    },
    [applyOptimisticUpdate],
  );

  /** Commit pan to server (on knob release) - clears optimistic state on completion */
  const handleCommitTrackPan = useCallback(
    async (trackId: string, value: number) => {
      try {
        await updateTrack({ id: trackId, projectId, pan: value });
      } catch {
        toast.error("Failed to update track pan");
      } finally {
        clearOptimisticUpdate(trackId, ["pan"]);
      }
    },
    [updateTrack, projectId, clearOptimisticUpdate],
  );

  // Merge server tracks with optimistic updates
  const tracksWithOptimisticUpdates = useMemo((): T[] | undefined => {
    if (!tracks) return undefined;
    return tracks.map((track): T => {
      const updates = optimisticUpdates.get(track._id);
      if (!updates) return track;
      return {
        ...track,
        muted: updates.muted ?? track.muted,
        solo: updates.solo ?? track.solo,
        gain: updates.gain ?? track.gain,
        pan: updates.pan ?? track.pan,
      } as T;
    });
  }, [tracks, optimisticUpdates]);

  return {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  };
}
