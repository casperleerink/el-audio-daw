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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_order", ["projectId", "order"]),

  clips: defineTable({
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    fileId: v.id("_storage"), // Convex storage ID, also used as VFS key
    name: v.string(), // Original filename
    startTime: v.number(), // Position on timeline in samples
    duration: v.number(), // Clip length in samples
    audioStartTime: v.number(), // Offset into source audio in samples (for future trimming)
    gain: v.number(), // Clip gain in dB
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_track", ["trackId"])
    .index("by_project", ["projectId"]),
});
