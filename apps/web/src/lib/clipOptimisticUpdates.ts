import type { Doc, Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { tempId } from "./optimistic";

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
  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
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
      audioDuration: args.duration, // Store original audio duration
      gain: 0,
      createdAt: now,
      updatedAt: now,
    };

    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, [
      ...current,
      newClip,
    ]);
  }
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
  if (!args.projectId) {
    // Without projectId, we can't update the query cache.
    // The mutation will still work, just not optimistically.
    return;
  }

  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
    const now = Date.now();
    // Clamp start time to 0 (matching server behavior FR-38)
    const newStartTime = Math.max(0, args.startTime);

    const updated = current.map((clip) => {
      if (clip._id !== args.id) return clip;
      return {
        ...clip,
        startTime: newStartTime,
        // Update trackId if provided (cross-track movement)
        trackId: args.trackId ?? clip.trackId,
        updatedAt: now,
      };
    });

    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, updated);
  }
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
  if (!args.projectId) {
    // Without projectId, we can't update the query cache.
    // The mutation will still work, just not optimistically.
    return;
  }

  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
    const filtered = current.filter((clip) => clip._id !== args.id);
    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, filtered);
  }
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
  if (!args.projectId) {
    return;
  }

  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
    const now = Date.now();

    const updated = current.map((clip) => {
      if (clip._id !== args.id) return clip;
      return {
        ...clip,
        startTime: args.startTime,
        audioStartTime: args.audioStartTime,
        duration: args.duration,
        updatedAt: now,
      };
    });

    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, updated);
  }
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
  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
    const now = Date.now();

    // Create temp clips for each pasted clip
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

    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, [
      ...current,
      ...newClips,
    ]);
  }
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
  if (!args.projectId) {
    return;
  }

  const current = localStore.getQuery(api.clips.getProjectClips, {
    projectId: args.projectId,
  });

  if (current !== undefined) {
    const clip = current.find((c) => c._id === args.id);
    if (!clip) return;

    const clipEnd = clip.startTime + clip.duration;

    // FR-39: Split only if splitTime is within clip bounds
    if (args.splitTime <= clip.startTime || args.splitTime >= clipEnd) {
      return;
    }

    const now = Date.now();

    // FR-40: Calculate new properties
    const leftDuration = args.splitTime - clip.startTime;
    const rightStartTime = args.splitTime;
    const rightDuration = clipEnd - args.splitTime;
    const rightAudioStartTime = clip.audioStartTime + leftDuration;

    // Create the right clip with temp ID
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

    // Update the original clip to become the left clip
    const updated = current.map((c) => {
      if (c._id !== args.id) return c;
      return {
        ...c,
        duration: leftDuration,
        updatedAt: now,
      };
    });

    localStore.setQuery(api.clips.getProjectClips, { projectId: args.projectId }, [
      ...updated,
      rightClip,
    ]);
  }
}
