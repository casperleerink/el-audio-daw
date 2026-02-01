import { defineQuery, defineQueries } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./schema.js";

export const queries = defineQueries({
  projects: {
    mine: defineQuery(({ ctx: { userID } }) =>
      zql.projectUsers.where("userId", userID).related("project"),
    ),

    byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx: { userID } }) =>
      zql.projects
        .where("id", id)
        .whereExists("projectUsers", (q) => q.where("userId", userID))
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
            q.whereExists("projectUsers", (pu) => pu.where("userId", userID)),
          ),
    ),
  },
});

export type Queries = typeof queries;
