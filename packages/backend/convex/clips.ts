import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isSupportedAudioType, MAX_FILE_SIZE } from "./constants";
import {
  checkProjectAccess,
  extendProjectDurationIfNeeded,
  getAuthUser,
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
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
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
    fileId: v.id("_storage"),
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
      fileId: args.fileId,
      name: args.name,
      startTime: args.startTime,
      duration: args.duration,
      audioStartTime: 0, // Default for new clips (FR-9)
      gain: 0, // Default 0 dB (FR-9)
      createdAt: now,
      updatedAt: now,
    });

    return clipId;
  },
});

/**
 * Update clip position (for dragging) (FR-34-38)
 */
export const updateClipPosition = mutation({
  args: {
    id: v.id("clips"),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Clamp to 0 (FR-38)
    const newStartTime = Math.max(0, args.startTime);
    const newClipEnd = newStartTime + clip.duration;

    // Handle clip overlap on move (FR-37)
    await handleClipOverlap(ctx.db, clip.trackId, newStartTime, newClipEnd, args.id);

    // Extend project duration if needed (FR-13)
    await extendProjectDurationIfNeeded(ctx.db, clip.projectId, newClipEnd);

    await ctx.db.patch(args.id, {
      startTime: newStartTime,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a clip
 */
export const deleteClip = mutation({
  args: {
    id: v.id("clips"),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Delete the stored audio file
    await ctx.storage.delete(clip.fileId);

    // Delete the clip record
    await ctx.db.delete(args.id);
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
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
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
 * Get file URLs for all clips in a project (for VFS loading)
 */
export const getProjectClipUrls = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
      return [];
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const clipUrls = await Promise.all(
      clips.map(async (clip) => ({
        clipId: clip._id,
        fileId: clip.fileId,
        url: await ctx.storage.getUrl(clip.fileId),
      })),
    );

    return clipUrls;
  },
});
