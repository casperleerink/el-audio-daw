import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
export * from "./auth-schema";
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  duration: integer("duration"),
  sampleRate: integer("sample_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const projectUsers = pgTable(
  "project_users",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().$type<"owner" | "collaborator">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("project_users_project_id_user_id_idx").on(table.projectId, table.userId)],
);

export const projectRelations = relations(projects, ({ many }) => ({
  users: many(projectUsers),
}));

export const projectUserRelations = relations(projectUsers, ({ one }) => ({
  project: one(projects, {
    fields: [projectUsers.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [projectUsers.userId],
    references: [user.id],
  }),
}));
