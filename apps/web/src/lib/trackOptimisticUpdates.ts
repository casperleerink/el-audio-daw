import type { Doc, Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { tempId, updateOptimisticQuery, withProjectIdGuard } from "./optimistic";

type Track = Doc<"tracks">;

// Args types for each mutation
type CreateTrackArgs = {
  projectId: Id<"projects">;
  name?: string;
};

type UpdateTrackArgs = {
  id: Id<"tracks">;
  projectId?: Id<"projects">;
  name?: string;
  muted?: boolean;
  solo?: boolean;
  gain?: number;
  pan?: number;
};

type DeleteTrackArgs = {
  id: Id<"tracks">;
  projectId?: Id<"projects">;
};

type ReorderTracksArgs = {
  projectId: Id<"projects">;
  trackIds: Id<"tracks">[];
};

/**
 * Optimistic update for createTrack mutation.
 * Instantly adds a new track with a temp ID to the local cache.
 */
export function createTrackOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: CreateTrackArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.tracks.getProjectTracks,
    { projectId: args.projectId },
    (current) => {
      const newOrder = current.length;
      const trackName = args.name ?? `Track ${newOrder + 1}`;
      const now = Date.now();

      const newTrack: Track = {
        _id: tempId<"tracks">(),
        _creationTime: now,
        projectId: args.projectId,
        name: trackName,
        order: newOrder,
        muted: false,
        solo: false,
        gain: 0,
        pan: 0,
        createdAt: now,
        updatedAt: now,
      };

      return [...current, newTrack];
    },
  );
}

/**
 * Optimistic update for updateTrack mutation.
 * Instantly applies name/mute/solo/gain changes to the local cache.
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 * Without projectId, the update will be a no-op (server will still process it).
 */
export function updateTrackOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: UpdateTrackArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.tracks.getProjectTracks, { projectId }, (current) => {
      const now = Date.now();
      return current.map((track) =>
        track._id !== args.id
          ? track
          : {
              ...track,
              name: args.name ?? track.name,
              muted: args.muted ?? track.muted,
              solo: args.solo ?? track.solo,
              gain: args.gain ?? track.gain,
              pan: args.pan ?? track.pan,
              updatedAt: now,
            },
      );
    });
  });
}

/**
 * Optimistic update for deleteTrack mutation.
 * Instantly removes the track from the local cache.
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 * Without projectId, the delete will be a no-op client-side (server will still process it).
 */
export function deleteTrackOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: DeleteTrackArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.tracks.getProjectTracks, { projectId }, (current) =>
      current.filter((track) => track._id !== args.id),
    );
  });
}

/**
 * Optimistic update for reorderTracks mutation.
 * Instantly reorders tracks in the local cache.
 */
export function reorderTracksOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: ReorderTracksArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.tracks.getProjectTracks,
    { projectId: args.projectId },
    (current) => {
      const trackMap = new Map(current.map((track) => [track._id, track]));
      const now = Date.now();

      return args.trackIds
        .map((id, index) => {
          const track = trackMap.get(id);
          if (!track) return null;
          return { ...track, order: index, updatedAt: now };
        })
        .filter((track): track is Track => track !== null);
    },
  );
}
