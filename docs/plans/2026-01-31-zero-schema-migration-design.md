# Zero Schema Migration Design

Migrate remaining Convex schemas (tracks, audioFiles, clips, trackEffects) to Drizzle/Zero.

## Decisions

| Topic | Decision |
|-------|----------|
| Storage | UploadThing URLs as text fields (`storageUrl`, `waveformUrl`) |
| Timestamps | Postgres native timestamps (Zero converts to numbers automatically) |
| effectData | JSONB column with Zod discriminated union validation |
| Zod | Use catalog version (`^4.1.13`), create `packages/schemas` for shared schemas |
| Cascade | All child tables cascade delete on parent |

## Tables to Add

### tracks

```ts
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
```

### audioFiles

```ts
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
```

### clips

```ts
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
```

### trackEffects

```ts
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
```

## Relations

```ts
// Update existing projectRelations
export const projectRelations = relations(projects, ({ many }) => ({
  users: many(projectUsers),
  tracks: many(tracks),
  audioFiles: many(audioFiles),
  clips: many(clips),
}));

export const trackRelations = relations(tracks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tracks.projectId],
    references: [projects.id],
  }),
  clips: many(clips),
  effects: many(trackEffects),
}));

export const audioFileRelations = relations(audioFiles, ({ one, many }) => ({
  project: one(projects, {
    fields: [audioFiles.projectId],
    references: [projects.id],
  }),
  clips: many(clips),
}));

export const clipRelations = relations(clips, ({ one }) => ({
  project: one(projects, {
    fields: [clips.projectId],
    references: [projects.id],
  }),
  track: one(tracks, {
    fields: [clips.trackId],
    references: [tracks.id],
  }),
  audioFile: one(audioFiles, {
    fields: [clips.audioFileId],
    references: [audioFiles.id],
  }),
}));

export const trackEffectRelations = relations(trackEffects, ({ one }) => ({
  track: one(tracks, {
    fields: [trackEffects.trackId],
    references: [tracks.id],
  }),
}));
```

## Zod Effect Schemas

Location: `packages/schemas/src/effects.ts`

```ts
import { z } from "zod";

export const filterEffectSchema = z.object({
  type: z.literal("filter"),
  cutoff: z.number().min(20).max(20000),
  resonance: z.number().min(0).max(1),
  filterType: z.enum(["lowpass", "highpass", "bandpass", "notch"]),
});

export const effectDataSchema = z.discriminatedUnion("type", [
  filterEffectSchema,
]);

export type FilterEffect = z.infer<typeof filterEffectSchema>;
export type EffectData = z.infer<typeof effectDataSchema>;
```

## Implementation Order

1. Create `packages/schemas` package with effect schemas
2. Add tables and relations to `packages/db/src/schema.ts`
3. Run Drizzle migration (`bun run db:generate && bun run db:migrate`)
4. Regenerate Zero schema (`bun run zero:generate`)
5. Add Zero queries and mutators for new tables
