import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  checkQueryAccess,
  getAuthUser,
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
} from "./utils";

export const createProject = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("projectUsers", {
      projectId,
      userId: user._id,
      role: "owner",
      joinedAt: now,
    });

    return projectId;
  },
});

export const updateProject = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.id);

    await ctx.db.patch(args.id, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

export const deleteProject = mutation({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.id);

    // Delete all tracks
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const track of tracks) {
      await ctx.db.delete(track._id);
    }

    // Delete all project users
    const projectUsers = await ctx.db
      .query("projectUsers")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const pu of projectUsers) {
      await ctx.db.delete(pu._id);
    }

    // Delete the project
    await ctx.db.delete(args.id);
  },
});

export const getProject = query({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.id);
    if (!user) {
      return null;
    }

    const project = await ctx.db.get(args.id);
    return project;
  },
});

export const getUserProjects = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return [];
    }

    const projectUsers = await ctx.db
      .query("projectUsers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const projects = await Promise.all(
      projectUsers.map(async (pu) => {
        const project = await ctx.db.get(pu.projectId);
        if (!project) return null;
        return {
          ...project,
          role: pu.role,
        };
      }),
    );

    return projects.filter((p) => p !== null);
  },
});
