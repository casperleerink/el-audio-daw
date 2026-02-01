import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
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

export const tracks = pgTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull(),
    color: text("color"),
    muted: boolean("muted").notNull().default(false),
    solo: boolean("solo").notNull().default(false),
    gain: real("gain").notNull().default(0),
    pan: real("pan").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("tracks_project_id_idx").on(table.projectId),
    index("tracks_project_id_order_idx").on(table.projectId, table.order),
  ],
);

export const audioFiles = pgTable(
  "audio_files",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storageUrl: text("storage_url").notNull(),
    waveformUrl: text("waveform_url"),
    name: text("name").notNull(),
    duration: integer("duration").notNull(),
    sampleRate: integer("sample_rate").notNull(),
    channels: integer("channels").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("audio_files_project_id_idx").on(table.projectId)],
);

export const clips = pgTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    audioFileId: text("audio_file_id")
      .notNull()
      .references(() => audioFiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startTime: integer("start_time").notNull(),
    duration: integer("duration").notNull(),
    audioStartTime: integer("audio_start_time").notNull(),
    gain: real("gain").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("clips_track_id_idx").on(table.trackId),
    index("clips_project_id_idx").on(table.projectId),
  ],
);

export const trackEffects = pgTable(
  "track_effects",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    effectData: jsonb("effect_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("track_effects_track_id_idx").on(table.trackId),
    index("track_effects_track_id_order_idx").on(table.trackId, table.order),
  ],
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
