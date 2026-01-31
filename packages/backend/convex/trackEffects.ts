import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkQueryAccess, requireProjectAccess } from "./utils";

// Effect data validator (reusable)
const effectDataValidator = v.union(
  v.object({
    type: v.literal("filter"),
    cutoff: v.number(),
    resonance: v.number(),
    filterType: v.union(
      v.literal("lowpass"),
      v.literal("highpass"),
      v.literal("bandpass"),
      v.literal("notch")
    ),
  })
);

export const getTrackEffects = query({
  args: {
    trackId: v.id("tracks"),
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.trackId);
    if (!track) return [];

    const user = await checkQueryAccess(ctx, track.projectId);
    if (!user) return [];

    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track_order", (q) => q.eq("trackId", args.trackId))
      .collect();

    return effects.sort((a, b) => a.order - b.order);
  },
});

export const createEffect = mutation({
  args: {
    trackId: v.id("tracks"),
    effectData: effectDataValidator,
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    // Get highest order number
    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", args.trackId))
      .collect();

    const maxOrder = effects.reduce((max, e) => Math.max(max, e.order), -1);

    const effectId = await ctx.db.insert("trackEffects", {
      trackId: args.trackId,
      order: maxOrder + 1,
      enabled: true,
      effectData: args.effectData,
    });

    return effectId;
  },
});

export const updateEffect = mutation({
  args: {
    id: v.id("trackEffects"),
    enabled: v.optional(v.boolean()),
    effectData: v.optional(effectDataValidator),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    const updates: Record<string, unknown> = {};
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.effectData !== undefined) updates.effectData = args.effectData;

    await ctx.db.patch(args.id, updates);
  },
});

export const deleteEffect = mutation({
  args: {
    id: v.id("trackEffects"),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    // Delete the effect
    await ctx.db.delete(args.id);

    // Reorder remaining effects to close gaps
    const remainingEffects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", effect.trackId))
      .collect();

    const sorted = remainingEffects.sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].order !== i) {
        await ctx.db.patch(sorted[i]._id, { order: i });
      }
    }
  },
});

export const reorderEffect = mutation({
  args: {
    id: v.id("trackEffects"),
    newOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    const oldOrder = effect.order;
    if (oldOrder === args.newOrder) return;

    // Get all effects for this track
    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", effect.trackId))
      .collect();

    // Update orders
    for (const e of effects) {
      if (e._id === args.id) {
        await ctx.db.patch(e._id, { order: args.newOrder });
      } else if (oldOrder < args.newOrder) {
        // Moving down: shift items in between up
        if (e.order > oldOrder && e.order <= args.newOrder) {
          await ctx.db.patch(e._id, { order: e.order - 1 });
        }
      } else {
        // Moving up: shift items in between down
        if (e.order >= args.newOrder && e.order < oldOrder) {
          await ctx.db.patch(e._id, { order: e.order + 1 });
        }
      }
    }
  },
});
