import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkQueryAccess, requireProjectAccess } from "./utils";

/**
 * Create an audio file record after upload.
 * This is called after the file is uploaded to storage.
 * Waveform generation is scheduled as a separate action.
 */
export const createAudioFile = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    name: v.string(),
    duration: v.number(), // in samples
    sampleRate: v.number(),
    channels: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const now = Date.now();
    const audioFileId = await ctx.db.insert("audioFiles", {
      projectId: args.projectId,
      storageId: args.storageId,
      waveformStorageId: undefined,
      name: args.name,
      duration: args.duration,
      sampleRate: args.sampleRate,
      channels: args.channels,
      createdAt: now,
    });

    return audioFileId;
  },
});

/**
 * Update an audio file's waveform storage ID.
 * Called by the waveform generation action after processing.
 */
export const updateWaveformStorageId = mutation({
  args: {
    audioFileId: v.id("audioFiles"),
    waveformStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    await requireProjectAccess(ctx, audioFile.projectId);

    await ctx.db.patch(args.audioFileId, {
      waveformStorageId: args.waveformStorageId,
    });
  },
});

/**
 * Get an audio file by ID.
 */
export const getAudioFile = query({
  args: {
    audioFileId: v.id("audioFiles"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return null;
    }

    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile || audioFile.projectId !== args.projectId) {
      return null;
    }
    return audioFile;
  },
});

/**
 * Get all audio files for a project.
 */
export const getProjectAudioFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("audioFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/**
 * Get waveform URLs for all audio files in a project.
 * Returns a map of audioFileId -> waveformUrl (or null if not yet generated).
 */
export const getProjectWaveformUrls = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return {};
    }

    const audioFiles = await ctx.db
      .query("audioFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const result: Record<string, string | null> = {};
    for (const audioFile of audioFiles) {
      if (audioFile.waveformStorageId) {
        result[audioFile._id] = await ctx.storage.getUrl(audioFile.waveformStorageId);
      } else {
        result[audioFile._id] = null;
      }
    }

    return result;
  },
});

/**
 * Delete an audio file and its associated storage files.
 * Only called when no clips reference this audio file.
 */
export const deleteAudioFile = mutation({
  args: {
    audioFileId: v.id("audioFiles"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    if (audioFile.projectId !== args.projectId) {
      throw new Error("Audio file does not belong to this project");
    }

    // Delete storage files
    await ctx.storage.delete(audioFile.storageId);
    if (audioFile.waveformStorageId) {
      await ctx.storage.delete(audioFile.waveformStorageId);
    }

    // Delete the record
    await ctx.db.delete(args.audioFileId);
  },
});
