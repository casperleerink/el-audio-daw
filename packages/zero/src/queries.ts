import { defineQuery, defineQueries } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema.gen";

export const queries = defineQueries({
  projects: {
    mine: defineQuery(({ ctx: { userID } }) =>
      zql.projectUsers.where("userId", userID).related("project"),
    ),
    byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx: { userID } }) =>
      zql.projects
        .where("id", id)
        .whereExists("users", (q) => q.where("userId", userID))
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
          .whereExists("project", (q) =>
            q.whereExists("users", (pu) => pu.where("userId", userID)),
          )
          .related("clips", (q) => q.related("audioFile"))
          .related("effects")
          .orderBy("order", "asc"),
    ),
    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args: { id }, ctx: { userID } }) =>
        zql.tracks
          .where("id", id)
          .whereExists("project", (q) =>
            q.whereExists("users", (pu) => pu.where("userId", userID)),
          )
          .related("clips", (q) => q.related("audioFile"))
          .related("effects")
          .one(),
    ),
  },
});

export type Queries = typeof queries;
