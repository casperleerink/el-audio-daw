import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  duration: integer("duration"),
  sampleRate: integer("sample_rate").default(44100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projectUsers = pgTable("project_users", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().$type<"owner" | "collaborator">(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
