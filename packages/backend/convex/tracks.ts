import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkProjectAccess, getAuthUser, requireProjectAccess } from "./utils";

export const createTrack = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Get highest order number
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const maxOrder = tracks.reduce((max, track) => Math.max(max, track.order), -1);
    const newOrder = maxOrder + 1;

    const trackName = args.name ?? `Track ${newOrder + 1}`;

    const now = Date.now();
    const trackId = await ctx.db.insert("tracks", {
      projectId: args.projectId,
      name: trackName,
      order: newOrder,
      muted: false,
      solo: false,
      gain: 0, // 0 dB
      createdAt: now,
      updatedAt: now,
    });

    return trackId;
  },
});

export const updateTrack = mutation({
  args: {
    id: v.id("tracks"),
    name: v.optional(v.string()),
    muted: v.optional(v.boolean()),
    solo: v.optional(v.boolean()),
    gain: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.id);
    if (!track) {
      throw new Error("Track not found");
    }

    await requireProjectAccess(ctx, track.projectId);

    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.muted !== undefined) updates.muted = args.muted;
    if (args.solo !== undefined) updates.solo = args.solo;
    if (args.gain !== undefined) updates.gain = args.gain;

    await ctx.db.patch(args.id, updates);
  },
});

export const deleteTrack = mutation({
  args: {
    id: v.id("tracks"),
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.id);
    if (!track) {
      throw new Error("Track not found");
    }

    await requireProjectAccess(ctx, track.projectId);

    await ctx.db.delete(args.id);
  },
});

export const reorderTracks = mutation({
  args: {
    projectId: v.id("projects"),
    trackIds: v.array(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const now = Date.now();
    for (let i = 0; i < args.trackIds.length; i++) {
      const track = await ctx.db.get(args.trackIds[i]);
      if (!track || track.projectId !== args.projectId) {
        throw new Error("Invalid track");
      }
      await ctx.db.patch(args.trackIds[i], {
        order: i,
        updatedAt: now,
      });
    }
  },
});

export const getProjectTracks = query({
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

    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_project_and_order", (q) => q.eq("projectId", args.projectId))
      .collect();

    return tracks.sort((a, b) => a.order - b.order);
  },
});
