import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    duration: v.optional(v.number()), // Project duration in samples
    sampleRate: v.optional(v.number()), // Project sample rate (default 44100)
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  projectUsers: defineTable({
    projectId: v.id("projects"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("collaborator")),
    joinedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  tracks: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    order: v.number(),
    color: v.optional(v.string()), // Track color for clip rendering (hex string)
    muted: v.boolean(),
    solo: v.boolean(),
    gain: v.number(),
    pan: v.optional(v.number()), // Stereo pan: -1 (left) to +1 (right), 0 = center
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_order", ["projectId", "order"]),

  audioFiles: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"), // Original audio file
    waveformStorageId: v.optional(v.id("_storage")), // Waveform data (null while processing)
    name: v.string(), // Original filename
    duration: v.number(), // Duration in samples
    sampleRate: v.number(),
    channels: v.number(), // 1 = mono, 2 = stereo
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_storage", ["storageId"]),

  clips: defineTable({
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    audioFileId: v.id("audioFiles"), // Reference to audioFiles table
    name: v.string(), // Original filename
    startTime: v.number(), // Position on timeline in samples
    duration: v.number(), // Clip length in samples (visible/playable portion)
    audioStartTime: v.number(), // Offset into source audio in samples (for trimming)
    gain: v.number(), // Clip gain in dB
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_track", ["trackId"])
    .index("by_project", ["projectId"]),

  trackEffects: defineTable({
    trackId: v.id("tracks"),
    order: v.number(), // Position in chain (0, 1, 2...)
    enabled: v.boolean(), // Bypass toggle
    effectData: v.union(
      v.object({
        type: v.literal("filter"),
        cutoff: v.number(), // 20-20000 Hz
        resonance: v.number(), // 0-1
        filterType: v.union(
          v.literal("lowpass"),
          v.literal("highpass"),
          v.literal("bandpass"),
          v.literal("notch")
        ),
      })
      // Future effects added as new union members
    ),
  })
    .index("by_track", ["trackId"])
    .index("by_track_order", ["trackId", "order"]),
});
