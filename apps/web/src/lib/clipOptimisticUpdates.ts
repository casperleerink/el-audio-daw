import type { Doc, Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { tempId, updateOptimisticQuery, withProjectIdGuard } from "./optimistic";

type Clip = Doc<"clips">;

// Args types for each mutation
type CreateClipArgs = {
  projectId: Id<"projects">;
  trackId: Id<"tracks">;
  fileId: Id<"_storage">;
  name: string;
  startTime: number;
  duration: number;
};

type UpdateClipPositionArgs = {
  id: Id<"clips">;
  startTime: number;
  trackId?: Id<"tracks">;
  projectId?: Id<"projects">;
};

type DeleteClipArgs = {
  id: Id<"clips">;
  projectId?: Id<"projects">;
};

type TrimClipArgs = {
  id: Id<"clips">;
  startTime: number;
  audioStartTime: number;
  duration: number;
  projectId?: Id<"projects">;
};

type PasteClipsArgs = {
  projectId: Id<"projects">;
  trackId: Id<"tracks">;
  clips: Array<{
    fileId: Id<"_storage">;
    name: string;
    startTime: number;
    duration: number;
    audioStartTime: number;
    audioDuration: number;
    gain: number;
  }>;
};

type SplitClipArgs = {
  id: Id<"clips">;
  splitTime: number;
  projectId?: Id<"projects">;
};

/**
 * Optimistic update for createClip mutation.
 * Instantly adds a new clip with a temp ID to the local cache.
 *
 * Note: Pending clips (with temp IDs) should not be draggable until server confirms.
 */
export function createClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: CreateClipArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.clips.getProjectClips,
    { projectId: args.projectId },
    (current) => {
      const now = Date.now();
      const newClip: Clip = {
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: args.projectId,
        trackId: args.trackId,
        fileId: args.fileId,
        name: args.name,
        startTime: args.startTime,
        duration: args.duration,
        audioStartTime: 0,
        audioDuration: args.duration,
        gain: 0,
        createdAt: now,
        updatedAt: now,
      };
      return [...current, newClip];
    },
  );
}

/**
 * Optimistic update for updateClipPosition mutation.
 * Instantly updates the clip's start time and optionally trackId in the local cache.
 * Supports both horizontal movement and cross-track movement (FR-31, FR-35).
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 * Without projectId, the update will be a no-op (server will still process it).
 */
export function updateClipPositionOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: UpdateClipPositionArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, (current) => {
      const now = Date.now();
      const newStartTime = Math.max(0, args.startTime);
      return current.map((clip) =>
        clip._id !== args.id
          ? clip
          : {
              ...clip,
              startTime: newStartTime,
              trackId: args.trackId ?? clip.trackId,
              updatedAt: now,
            },
      );
    });
  });
}

/**
 * Optimistic update for deleteClip mutation.
 * Instantly removes the clip from the local cache.
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 * Without projectId, the delete will be a no-op client-side (server will still process it).
 */
export function deleteClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: DeleteClipArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, (current) =>
      current.filter((clip) => clip._id !== args.id),
    );
  });
}

/**
 * Optimistic update for trimClip mutation.
 * Instantly updates the clip's trim boundaries in the local cache.
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 */
export function trimClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: TrimClipArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, (current) => {
      const now = Date.now();
      return current.map((clip) =>
        clip._id !== args.id
          ? clip
          : {
              ...clip,
              startTime: args.startTime,
              audioStartTime: args.audioStartTime,
              duration: args.duration,
              updatedAt: now,
            },
      );
    });
  });
}

/**
 * Optimistic update for pasteClips mutation.
 * Instantly adds new clips with temp IDs to the local cache.
 *
 * Pasted clips appear immediately with pending state (temp IDs),
 * then get replaced with real IDs when server confirms (FR-29).
 */
export function pasteClipsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: PasteClipsArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.clips.getProjectClips,
    { projectId: args.projectId },
    (current) => {
      const now = Date.now();
      const newClips: Clip[] = args.clips.map((clip) => ({
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: args.projectId,
        trackId: args.trackId,
        fileId: clip.fileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        audioDuration: clip.audioDuration,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      }));
      return [...current, ...newClips];
    },
  );
}

/**
 * Optimistic update for splitClip mutation.
 * Instantly updates the original clip's duration and adds a new right clip.
 *
 * Note: Requires projectId to be passed in args for optimistic update to work.
 */
export function splitClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: SplitClipArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, (current) => {
      const clip = current.find((c) => c._id === args.id);
      if (!clip) return current;

      const clipEnd = clip.startTime + clip.duration;

      // FR-39: Split only if splitTime is within clip bounds
      if (args.splitTime <= clip.startTime || args.splitTime >= clipEnd) {
        return current;
      }

      const now = Date.now();
      const leftDuration = args.splitTime - clip.startTime;
      const rightStartTime = args.splitTime;
      const rightDuration = clipEnd - args.splitTime;
      const rightAudioStartTime = clip.audioStartTime + leftDuration;

      const rightClip: Clip = {
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: clip.projectId,
        trackId: clip.trackId,
        fileId: clip.fileId,
        name: clip.name,
        startTime: rightStartTime,
        duration: rightDuration,
        audioStartTime: rightAudioStartTime,
        audioDuration: clip.audioDuration,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      };

      const updated = current.map((c) =>
        c._id !== args.id ? c : { ...c, duration: leftDuration, updatedAt: now },
      );

      return [...updated, rightClip];
    });
  });
}
