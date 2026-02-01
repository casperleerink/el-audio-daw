import {
  createSchema,
  table,
  string,
  number,
  relationships,
  enumeration,
} from "@rocicorp/zero";

const projects = table("projects")
  .from("projects")
  .columns({
    id: string(),
    name: string(),
    duration: number().optional(),
    sampleRate: number().optional(),
    createdAt: string().from("created_at"),
    updatedAt: string().from("updated_at"),
  })
  .primaryKey("id");

const projectUsers = table("projectUsers")
  .from("project_users")
  .columns({
    id: string(),
    projectId: string().from("project_id"),
    userId: string().from("user_id"),
    role: enumeration<"owner" | "collaborator">(),
    createdAt: string().from("created_at"),
  })
  .primaryKey("id");

const projectRelationships = relationships(projects, ({ many }) => ({
  projectUsers: many({
    sourceField: ["id"],
    destField: ["projectId"],
    destSchema: projectUsers,
  }),
}));

const projectUserRelationships = relationships(projectUsers, ({ one }) => ({
  project: one({
    sourceField: ["projectId"],
    destField: ["id"],
    destSchema: projects,
  }),
}));

export const schema = createSchema({
  tables: [projects, projectUsers],
  relationships: [projectRelationships, projectUserRelationships],
});

export type Schema = typeof schema;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: Schema;
  }
}
