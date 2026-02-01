import { defineMutator, defineMutators } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema.gen";

export const mutators = defineMutators({
  projects: {
    create: defineMutator(
      z.object({
        id: z.uuid(),
        projectUserId: z.uuid(),
        name: z.string().min(1).max(255),
      }),
      async ({ tx, ctx: { userID }, args: { id, projectUserId, name } }) => {
        const now = Date.now();

        await tx.mutate.projects.insert({
          id,
          name,
          duration: null,
          sampleRate: 44100,
          createdAt: now,
          updatedAt: now,
        });

        await tx.mutate.projectUsers.insert({
          id: projectUserId,
          projectId: id,
          userId: userID,
          role: "owner",
          createdAt: now,
        });
      },
    ),

    update: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
      async ({ tx, ctx: { userID }, args: { id, name } }) => {
        const access = await tx.run(
          zql.projectUsers.where("projectId", id).where("userId", userID).one(),
        );

        if (!access) {
          throw new Error("Not authorized");
        }

        await tx.mutate.projects.update({
          id,
          name,
          updatedAt: Date.now(),
        });
      },
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const access = await tx.run(
          zql.projectUsers
            .where("projectId", id)
            .where("userId", userID)
            .where("role", "owner")
            .one(),
        );

        if (!access) {
          throw new Error("Only owner can delete project");
        }

        // Delete projectUsers first (cascade)
        const projectUsers = await tx.run(zql.projectUsers.where("projectId", id));

        for (const pu of projectUsers) {
          await tx.mutate.projectUsers.delete({ id: pu.id });
        }

        await tx.mutate.projects.delete({ id });
      },
    ),
  },

  tracks: {
    create: defineMutator(
      z.object({
        id: z.uuid(),
        projectId: z.string().uuid(),
        name: z.string().min(1).max(255),
        order: z.number().int().min(0),
        color: z.string().optional(),
      }),
      async ({ tx, ctx: { userID }, args: { id, projectId, name, order, color } }) => {
        const access = await tx.run(
          zql.projectUsers.where("projectId", projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        const now = Date.now();
        await tx.mutate.tracks.insert({
          id,
          projectId,
          name,
          order,
          color: color ?? null,
          muted: false,
          solo: false,
          gain: 0,
          pan: 0,
          createdAt: now,
          updatedAt: now,
        });
      },
    ),

    update: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        muted: z.boolean().optional(),
        solo: z.boolean().optional(),
        gain: z.number().optional(),
        pan: z.number().min(-1).max(1).optional(),
        color: z.string().nullable().optional(),
      }),
      async ({ tx, ctx: { userID }, args: { id, ...updates } }) => {
        const track = await tx.run(zql.tracks.where("id", id).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.tracks.update({
          id,
          ...updates,
          updatedAt: Date.now(),
        });
      },
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const track = await tx.run(zql.tracks.where("id", id).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.tracks.delete({ id });
      },
    ),

    reorder: defineMutator(
      z.object({
        projectId: z.string().uuid(),
        trackIds: z.array(z.string().uuid()),
      }),
      async ({ tx, ctx: { userID }, args: { projectId, trackIds } }) => {
        const access = await tx.run(
          zql.projectUsers.where("projectId", projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        const now = Date.now();
        for (const [index, trackId] of trackIds.entries()) {
          await tx.mutate.tracks.update({
            id: trackId,
            order: index,
            updatedAt: now,
          });
        }
      },
    ),
  },
});

export type Mutators = typeof mutators;
