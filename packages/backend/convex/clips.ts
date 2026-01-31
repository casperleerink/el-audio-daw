import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isSupportedAudioType, MAX_FILE_SIZE } from "./constants";
import {
  checkQueryAccess,
  extendProjectDurationIfNeeded,
  handleClipOverlap,
  requireProjectAccess,
} from "./utils";

/**
 * Generate an upload URL for audio file uploads (FR-8)
 * Client-side validation should happen before calling this
 */
export const generateUploadUrl = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Validate uploaded audio file metadata (FR-5, FR-6, FR-7)
 * Called after file is uploaded to verify it meets requirements
 */
export const validateUploadedFile = mutation({
  args: {
    storageId: v.id("_storage"),
    projectId: v.id("projects"),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Validate file size (FR-6)
    if (args.size > MAX_FILE_SIZE) {
      // Delete the uploaded file
      await ctx.storage.delete(args.storageId);
      throw new Error(
        `File too large. Maximum size is 100MB, got ${Math.round(args.size / 1024 / 1024)}MB`,
      );
    }

    // Validate content type (FR-7)
    if (!isSupportedAudioType(args.contentType)) {
      // Delete the uploaded file
      await ctx.storage.delete(args.storageId);
      throw new Error(
        `Unsupported audio format: ${args.contentType}. Supported formats: WAV, MP3, AIFF, FLAC, OGG`,
      );
    }

    return { valid: true, storageId: args.storageId };
  },
});

/**
 * Get the URL for a stored audio file (for client-side decoding and VFS loading)
 */
export const getFileUrl = query({
  args: {
    storageId: v.id("_storage"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return null;
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Create a clip record after successful upload (FR-9)
 */
export const createClip = mutation({
  args: {
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    audioFileId: v.id("audioFiles"),
    name: v.string(),
    startTime: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Verify track belongs to project
    const track = await ctx.db.get(args.trackId);
    if (!track || track.projectId !== args.projectId) {
      throw new Error("Track not found in this project");
    }

    // Verify audio file belongs to project
    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile || audioFile.projectId !== args.projectId) {
      throw new Error("Audio file not found in this project");
    }

    // Validate position
    if (args.startTime < 0) {
      throw new Error("Start time cannot be negative");
    }
    if (args.duration <= 0) {
      throw new Error("Duration must be positive");
    }

    const newClipEnd = args.startTime + args.duration;

    // Handle clip overlap (FR-12)
    await handleClipOverlap(ctx.db, args.trackId, args.startTime, newClipEnd);

    // Extend project duration if needed (FR-13)
    await extendProjectDurationIfNeeded(ctx.db, args.projectId, newClipEnd);

    const now = Date.now();
    const clipId = await ctx.db.insert("clips", {
      projectId: args.projectId,
      trackId: args.trackId,
      audioFileId: args.audioFileId,
      name: args.name,
      startTime: args.startTime,
      duration: args.duration,
      audioStartTime: 0,
      gain: 0,
      createdAt: now,
      updatedAt: now,
    });

    return clipId;
  },
});

/**
 * Update clip position (for dragging) (FR-34-38)
 * Supports both horizontal movement (startTime) and cross-track movement (trackId)
 *
 * Note: projectId is optional but required for optimistic updates to work.
 * Without projectId, the mutation will still execute but won't update the cache optimistically.
 */
export const updateClipPosition = mutation({
  args: {
    id: v.id("clips"),
    startTime: v.number(),
    trackId: v.optional(v.id("tracks")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Determine target track (FR-31, FR-35)
    const targetTrackId = args.trackId ?? clip.trackId;

    // Verify new track belongs to project (if changing tracks)
    if (args.trackId && args.trackId !== clip.trackId) {
      const newTrack = await ctx.db.get(args.trackId);
      if (!newTrack || newTrack.projectId !== clip.projectId) {
        throw new Error("Target track not found in this project");
      }
    }

    // Clamp to 0 (FR-38)
    const newStartTime = Math.max(0, args.startTime);
    const newClipEnd = newStartTime + clip.duration;

    // Handle clip overlap on target track (FR-37)
    await handleClipOverlap(ctx.db, targetTrackId, newStartTime, newClipEnd, args.id);

    // Extend project duration if needed (FR-13)
    await extendProjectDurationIfNeeded(ctx.db, clip.projectId, newClipEnd);

    await ctx.db.patch(args.id, {
      startTime: newStartTime,
      trackId: targetTrackId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Trim a clip by adjusting its boundaries (FR-14 through FR-22)
 *
 * Left trim: adjusts startTime and audioStartTime together (keeping audio aligned)
 * Right trim: adjusts duration only
 *
 * Note: projectId is optional but required for optimistic updates to work.
 */
export const trimClip = mutation({
  args: {
    id: v.id("clips"),
    startTime: v.number(),
    audioStartTime: v.number(),
    duration: v.number(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Get audio file to check audioDuration
    const audioFile = await ctx.db.get(clip.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    // Validate constraints (FR-18, FR-19, FR-20)
    if (args.audioStartTime < 0) {
      throw new Error("Cannot trim before audio start (audioStartTime < 0)");
    }
    if (args.duration <= 0) {
      throw new Error("Duration must be positive");
    }
    if (args.audioStartTime + args.duration > audioFile.duration) {
      throw new Error("Cannot extend beyond audio end");
    }
    if (args.startTime < 0) {
      throw new Error("Start time cannot be negative");
    }

    const newClipEnd = args.startTime + args.duration;

    // Handle clip overlap after trim
    await handleClipOverlap(ctx.db, clip.trackId, args.startTime, newClipEnd, args.id);

    // Extend project duration if needed
    await extendProjectDurationIfNeeded(ctx.db, clip.projectId, newClipEnd);

    await ctx.db.patch(args.id, {
      startTime: args.startTime,
      audioStartTime: args.audioStartTime,
      duration: args.duration,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a clip
 *
 * Note: projectId is optional but required for optimistic updates to work.
 * Without projectId, the mutation will still execute but won't update the cache optimistically.
 */
export const deleteClip = mutation({
  args: {
    id: v.id("clips"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Note: We don't delete the audio file here because other clips may reference it.
    // Audio file cleanup should be handled separately (e.g., when project is deleted
    // or via a cleanup job that finds orphaned audio files).

    // Delete the clip record
    await ctx.db.delete(args.id);
  },
});

/**
 * Paste clips from clipboard - batch create clips reusing existing audioFileIds (FR-28)
 *
 * Creates new clip records that reference the same audio files as the source clips.
 * No storage duplication occurs - clips are just references to existing audio.
 */
export const pasteClips = mutation({
  args: {
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    clips: v.array(
      v.object({
        audioFileId: v.id("audioFiles"),
        name: v.string(),
        startTime: v.number(),
        duration: v.number(),
        audioStartTime: v.number(),
        gain: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Verify track belongs to project
    const track = await ctx.db.get(args.trackId);
    if (!track || track.projectId !== args.projectId) {
      throw new Error("Track not found in this project");
    }

    // Verify all audio files belong to project
    const audioFileIds = [...new Set(args.clips.map((c) => c.audioFileId))];
    for (const audioFileId of audioFileIds) {
      const audioFile = await ctx.db.get(audioFileId);
      if (!audioFile || audioFile.projectId !== args.projectId) {
        throw new Error("Audio file not found in this project");
      }
    }

    const createdClipIds: string[] = [];
    const now = Date.now();

    // Sort clips by start time to handle overlaps in order
    const sortedClips = [...args.clips].sort((a, b) => a.startTime - b.startTime);

    for (const clip of sortedClips) {
      // Validate position
      if (clip.startTime < 0) {
        throw new Error("Start time cannot be negative");
      }
      if (clip.duration <= 0) {
        throw new Error("Duration must be positive");
      }

      const clipEnd = clip.startTime + clip.duration;

      // Handle clip overlap (FR-12)
      await handleClipOverlap(ctx.db, args.trackId, clip.startTime, clipEnd);

      // Extend project duration if needed (FR-13)
      await extendProjectDurationIfNeeded(ctx.db, args.projectId, clipEnd);

      const clipId = await ctx.db.insert("clips", {
        projectId: args.projectId,
        trackId: args.trackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      });

      createdClipIds.push(clipId);
    }

    return createdClipIds;
  },
});

/**
 * Split a clip at a given position (FR-38 through FR-45)
 *
 * Creates two clips from one:
 * - Left clip: original startTime, duration = splitTime - startTime, original audioStartTime
 * - Right clip: startTime = splitTime, duration = original end - splitTime, audioStartTime adjusted
 *
 * Both clips reference the same audio file (no storage duplication).
 * Gain setting is preserved on both clips.
 *
 * Note: projectId is optional but required for optimistic updates to work.
 */
export const splitClip = mutation({
  args: {
    id: v.id("clips"),
    splitTime: v.number(), // Timeline position (in samples) to split at
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    const clipEnd = clip.startTime + clip.duration;

    // FR-39: Split only if splitTime is within clip bounds
    if (args.splitTime <= clip.startTime || args.splitTime >= clipEnd) {
      throw new Error("Split position must be within the clip boundaries");
    }

    const now = Date.now();

    // FR-40: Calculate left clip properties
    const leftDuration = args.splitTime - clip.startTime;

    // FR-40: Calculate right clip properties
    const rightStartTime = args.splitTime;
    const rightDuration = clipEnd - args.splitTime;
    // audioStartTime for right clip: advance by how much we cut from the left
    const rightAudioStartTime = clip.audioStartTime + leftDuration;

    // Update the original clip to become the left clip
    await ctx.db.patch(args.id, {
      duration: leftDuration,
      updatedAt: now,
    });

    // Create the right clip (FR-41: same audioFileId, FR-42: same gain)
    const rightClipId = await ctx.db.insert("clips", {
      projectId: clip.projectId,
      trackId: clip.trackId,
      audioFileId: clip.audioFileId,
      name: clip.name,
      startTime: rightStartTime,
      duration: rightDuration,
      audioStartTime: rightAudioStartTime,
      gain: clip.gain,
      createdAt: now,
      updatedAt: now,
    });

    return {
      leftClipId: args.id,
      rightClipId,
    };
  },
});

/**
 * Get all clips for a project (FR-17)
 */
export const getProjectClips = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return [];
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return clips;
  },
});

/**
 * Get file URLs for all audio files in a project (for VFS loading)
 * Returns a map of audioFileId -> URL for efficient lookup
 */
export const getProjectClipUrls = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return {};
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Get unique audioFileIds
    const audioFileIds = [...new Set(clips.map((clip) => clip.audioFileId))];

    // Fetch audio files and their URLs
    const audioFileUrls = new Map<string, string | null>();
    for (const audioFileId of audioFileIds) {
      const audioFile = await ctx.db.get(audioFileId);
      if (audioFile) {
        audioFileUrls.set(audioFileId, await ctx.storage.getUrl(audioFile.storageId));
      }
    }

    // Build result keyed by audioFileId (not clipId) to avoid duplication
    const result: Record<string, string | null> = {};
    for (const [audioFileId, url] of audioFileUrls) {
      result[audioFileId] = url;
    }

    return result;
  },
});
