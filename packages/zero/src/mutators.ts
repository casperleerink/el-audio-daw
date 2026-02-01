import { defineMutator, defineMutators } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema.js";

export const mutators = defineMutators({
  projects: {
    create: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
      async ({ tx, ctx: { userID }, args: { id, name } }) => {
        const now = new Date().toISOString();

        await tx.mutate.projects.insert({
          id,
          name,
          duration: null,
          sampleRate: 44100,
          createdAt: now,
          updatedAt: now,
        });

        await tx.mutate.projectUsers.insert({
          id: crypto.randomUUID(),
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
          updatedAt: new Date().toISOString(),
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
});

export type Mutators = typeof mutators;
