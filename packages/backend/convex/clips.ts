import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { isSupportedAudioType, MAX_FILE_SIZE } from "./constants";
import { checkProjectAccess } from "./utils";

/**
 * Generate an upload URL for audio file uploads (FR-8)
 * Client-side validation should happen before calling this
 */
export const generateUploadUrl = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
      throw new Error("Not authorized to access this project");
    }

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
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
      throw new Error("Not authorized to access this project");
    }

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
    const user = await authComponent.safeGetAuthUser(ctx);
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
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const hasAccess = await checkProjectAccess(ctx.db, args.projectId, user._id);
    if (!hasAccess) {
      throw new Error("Not authorized to access this project");
    }

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

    // Handle clip overlap (FR-12)
    const existingClips = await ctx.db
      .query("clips")
      .withIndex("by_track", (q) => q.eq("trackId", args.trackId))
      .collect();

    const newClipEnd = args.startTime + args.duration;

    for (const clip of existingClips) {
      const clipEnd = clip.startTime + clip.duration;

      // Check if new clip completely covers existing clip
      if (args.startTime <= clip.startTime && newClipEnd >= clipEnd) {
        // Delete existing clip
        await ctx.db.delete(clip._id);
        continue;
      }

      // Check if new clip starts inside existing clip
      if (args.startTime > clip.startTime && args.startTime < clipEnd) {
        // Truncate existing clip's duration to end where new clip starts
        await ctx.db.patch(clip._id, {
          duration: args.startTime - clip.startTime,
          updatedAt: Date.now(),
        });
      }
    }

    // Get project to check/update duration (FR-13)
    const project = await ctx.db.get(args.projectId);
    if (project) {
      const projectSampleRate = project.sampleRate ?? 44100;
      const currentDuration = project.duration ?? 10 * projectSampleRate;

      // Extend project duration if needed
      if (newClipEnd > currentDuration) {
        const extendedDuration = newClipEnd + 10 * projectSampleRate;
        await ctx.db.patch(args.projectId, {
          duration: extendedDuration,
          updatedAt: Date.now(),
        });
      }
    }

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
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    const hasAccess = await checkProjectAccess(ctx.db, clip.projectId, user._id);
    if (!hasAccess) {
      throw new Error("Not authorized to access this project");
    }

    // Clamp to 0 (FR-38)
    const newStartTime = Math.max(0, args.startTime);
    const newClipEnd = newStartTime + clip.duration;

    // Handle clip overlap on move (FR-37)
    const existingClips = await ctx.db
      .query("clips")
      .withIndex("by_track", (q) => q.eq("trackId", clip.trackId))
      .collect();

    for (const existingClip of existingClips) {
      if (existingClip._id === args.id) continue; // Skip self

      const existingClipEnd = existingClip.startTime + existingClip.duration;

      // Check if moved clip completely covers existing clip
      if (newStartTime <= existingClip.startTime && newClipEnd >= existingClipEnd) {
        await ctx.db.delete(existingClip._id);
        continue;
      }

      // Check if moved clip starts inside existing clip
      if (newStartTime > existingClip.startTime && newStartTime < existingClipEnd) {
        await ctx.db.patch(existingClip._id, {
          duration: newStartTime - existingClip.startTime,
          updatedAt: Date.now(),
        });
      }
    }

    // Check if project duration needs extending (FR-13)
    const project = await ctx.db.get(clip.projectId);
    if (project) {
      const projectSampleRate = project.sampleRate ?? 44100;
      const currentDuration = project.duration ?? 10 * projectSampleRate;

      if (newClipEnd > currentDuration) {
        const extendedDuration = newClipEnd + 10 * projectSampleRate;
        await ctx.db.patch(clip.projectId, {
          duration: extendedDuration,
          updatedAt: Date.now(),
        });
      }
    }

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
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    const hasAccess = await checkProjectAccess(ctx.db, clip.projectId, user._id);
    if (!hasAccess) {
      throw new Error("Not authorized to access this project");
    }

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
    const user = await authComponent.safeGetAuthUser(ctx);
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
    const user = await authComponent.safeGetAuthUser(ctx);
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
