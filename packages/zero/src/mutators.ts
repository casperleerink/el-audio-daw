import { defineMutator, defineMutators } from "@rocicorp/zero";
import { z } from "zod";
import { effectDataSchema } from "@el-audio-daw/schemas/effects";
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

  audioFiles: {
    create: defineMutator(
      z.object({
        id: z.uuid(),
        projectId: z.string().uuid(),
        storageUrl: z.string().min(1),
        waveformUrl: z.string().min(1).optional(),
        name: z.string().min(1).max(255),
        duration: z.number().int().positive(),
        sampleRate: z.number().int().positive(),
        channels: z.number().int().min(1).max(2),
      }),
      async ({ tx, ctx: { userID }, args }) => {
        const access = await tx.run(
          zql.projectUsers.where("projectId", args.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.audioFiles.insert({
          ...args,
          waveformUrl: args.waveformUrl ?? null,
          createdAt: Date.now(),
        });
      },
    ),

    updateWaveform: defineMutator(
      z.object({
        id: z.string().uuid(),
        waveformUrl: z.string().min(1),
      }),
      async ({ tx, ctx: { userID }, args: { id, waveformUrl } }) => {
        const audioFile = await tx.run(zql.audioFiles.where("id", id).one());
        if (!audioFile) throw new Error("Audio file not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", audioFile.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.audioFiles.update({ id, waveformUrl });
      },
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const audioFile = await tx.run(zql.audioFiles.where("id", id).one());
        if (!audioFile) throw new Error("Audio file not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", audioFile.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.audioFiles.delete({ id });
      },
    ),
  },

  clips: {
    create: defineMutator(
      z.object({
        id: z.uuid(),
        projectId: z.string().uuid(),
        trackId: z.string().uuid(),
        audioFileId: z.string().uuid(),
        name: z.string().min(1).max(255),
        startTime: z.number().int().min(0),
        duration: z.number().int().positive(),
        audioStartTime: z.number().int().min(0),
        gain: z.number().default(0),
      }),
      async ({ tx, ctx: { userID }, args }) => {
        const access = await tx.run(
          zql.projectUsers.where("projectId", args.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        const now = Date.now();
        await tx.mutate.clips.insert({
          ...args,
          createdAt: now,
          updatedAt: now,
        });
      },
    ),

    update: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        startTime: z.number().int().min(0).optional(),
        duration: z.number().int().positive().optional(),
        audioStartTime: z.number().int().min(0).optional(),
        gain: z.number().optional(),
      }),
      async ({ tx, ctx: { userID }, args: { id, ...updates } }) => {
        const clip = await tx.run(zql.clips.where("id", id).one());
        if (!clip) throw new Error("Clip not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", clip.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.clips.update({
          id,
          ...updates,
          updatedAt: Date.now(),
        });
      },
    ),

    move: defineMutator(
      z.object({
        id: z.string().uuid(),
        trackId: z.string().uuid(),
        startTime: z.number().int().min(0),
      }),
      async ({ tx, ctx: { userID }, args: { id, trackId, startTime } }) => {
        const clip = await tx.run(zql.clips.where("id", id).one());
        if (!clip) throw new Error("Clip not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", clip.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.clips.update({
          id,
          trackId,
          startTime,
          updatedAt: Date.now(),
        });
      },
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const clip = await tx.run(zql.clips.where("id", id).one());
        if (!clip) throw new Error("Clip not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", clip.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.clips.delete({ id });
      },
    ),
  },

  trackEffects: {
    create: defineMutator(
      z.object({
        id: z.uuid(),
        trackId: z.string().uuid(),
        order: z.number().int().min(0),
        enabled: z.boolean().default(true),
        effectData: effectDataSchema,
      }),
      async ({ tx, ctx: { userID }, args: { id, trackId, order, enabled, effectData } }) => {
        const track = await tx.run(zql.tracks.where("id", trackId).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        const now = Date.now();
        await tx.mutate.trackEffects.insert({
          id,
          trackId,
          order,
          enabled,
          effectData,
          createdAt: now,
          updatedAt: now,
        });
      },
    ),

    update: defineMutator(
      z.object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        effectData: effectDataSchema.optional(),
      }),
      async ({ tx, ctx: { userID }, args: { id, enabled, effectData } }) => {
        const effect = await tx.run(zql.trackEffects.where("id", id).one());
        if (!effect) throw new Error("Effect not found");

        const track = await tx.run(zql.tracks.where("id", effect.trackId).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.trackEffects.update({
          id,
          ...(enabled !== undefined && { enabled }),
          ...(effectData !== undefined && { effectData }),
          updatedAt: Date.now(),
        });
      },
    ),

    reorder: defineMutator(
      z.object({
        trackId: z.string().uuid(),
        effectIds: z.array(z.string().uuid()),
      }),
      async ({ tx, ctx: { userID }, args: { trackId, effectIds } }) => {
        const track = await tx.run(zql.tracks.where("id", trackId).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        const now = Date.now();
        for (const [index, effectId] of effectIds.entries()) {
          await tx.mutate.trackEffects.update({
            id: effectId,
            order: index,
            updatedAt: now,
          });
        }
      },
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const effect = await tx.run(zql.trackEffects.where("id", id).one());
        if (!effect) throw new Error("Effect not found");

        const track = await tx.run(zql.tracks.where("id", effect.trackId).one());
        if (!track) throw new Error("Track not found");

        const access = await tx.run(
          zql.projectUsers.where("projectId", track.projectId).where("userId", userID).one(),
        );
        if (!access) throw new Error("Not authorized");

        await tx.mutate.trackEffects.delete({ id });
      },
    ),
  },
});

export type Mutators = typeof mutators;
