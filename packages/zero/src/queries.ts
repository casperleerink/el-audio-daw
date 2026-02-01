import { defineQuery, defineQueries } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema.gen";

export const queries = defineQueries({
  projects: {
    mine: defineQuery(({ ctx: { userID } }) => {
      return zql.projectUsers.where("userId", userID).related("project");
    }),
    byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx: { userID } }) =>
      zql.projects
        .where("id", id)
        .whereExists("users", (q) => q.where("userId", userID))
        .related("tracks", (q) => q.related("effects"))
        .related("clips", (q) => q.related("audioFile"))
        .related("audioFiles")
        .related("users")
        .one(),
    ),
  },
  projectUsers: {
    byProject: defineQuery(
      z.object({ projectId: z.string() }),
      ({ args: { projectId }, ctx: { userID } }) =>
        zql.projectUsers
          .where("projectId", projectId)
          .whereExists("project", (q) =>
            q.whereExists("users", (pu) => pu.where("userId", userID)),
          ),
    ),
  },
  tracks: {
    byProject: defineQuery(
      z.object({ projectId: z.string() }),
      ({ args: { projectId }, ctx: { userID } }) =>
        zql.tracks
          .where("projectId", projectId)
          .whereExists("project", (q) => q.whereExists("users", (pu) => pu.where("userId", userID)))
          .related("clips", (q) => q.related("audioFile"))
          .related("effects", (q) => q.orderBy("order", "asc"))
          .orderBy("order", "asc"),
    ),
    byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx: { userID } }) =>
      zql.tracks
        .where("id", id)
        .whereExists("project", (q) => q.whereExists("users", (pu) => pu.where("userId", userID)))
        .related("clips", (q) => q.related("audioFile"))
        .related("effects", (q) => q.orderBy("order", "asc"))
        .one(),
    ),
  },
  audioFiles: {
    byProject: defineQuery(
      z.object({ projectId: z.string() }),
      ({ args: { projectId }, ctx: { userID } }) =>
        zql.audioFiles
          .where("projectId", projectId)
          .whereExists("project", (q) =>
            q.whereExists("users", (pu) => pu.where("userId", userID)),
          ),
    ),
  },
  clips: {
    byProject: defineQuery(
      z.object({ projectId: z.string() }),
      ({ args: { projectId }, ctx: { userID } }) =>
        zql.clips
          .where("projectId", projectId)
          .whereExists("project", (q) => q.whereExists("users", (pu) => pu.where("userId", userID)))
          .related("audioFile"),
    ),
    byTrack: defineQuery(
      z.object({ trackId: z.string() }),
      ({ args: { trackId }, ctx: { userID } }) =>
        zql.clips
          .where("trackId", trackId)
          .whereExists("project", (q) => q.whereExists("users", (pu) => pu.where("userId", userID)))
          .related("audioFile"),
    ),
  },
});

export type Queries = typeof queries;
