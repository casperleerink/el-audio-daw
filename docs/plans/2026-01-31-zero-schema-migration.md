# Zero Schema Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tracks, audioFiles, clips, and trackEffects tables to Drizzle/Zero

**Architecture:** Drizzle tables with relations auto-generate Zero schema via drizzle-zero. Shared Zod schemas in new package validate JSONB effect data.

**Tech Stack:** Drizzle ORM, Zero, Zod v4, Postgres

---

## Task 1: Create packages/schemas package

**Files:**

- Create: `packages/schemas/package.json`
- Create: `packages/schemas/src/index.ts`
- Create: `packages/schemas/src/effects.ts`
- Create: `packages/schemas/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@el-audio-daw/schemas",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./effects": "./src/effects.ts"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "@el-audio-daw/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "@el-audio-daw/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create effects.ts**

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

**Step 4: Create index.ts**

```ts
export * from "./effects";
```

**Step 5: Install dependencies**

Run: `bun install`

**Step 6: Verify types**

Run: `bun check-types --filter=@el-audio-daw/schemas`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/schemas
git commit -m "feat: add @el-audio-daw/schemas package with effect schemas"
```

---

## Task 2: Add tables to Drizzle schema

**Files:**

- Modify: `packages/db/src/schema.ts`

**Step 1: Add imports**

Add to imports at top of file:

```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
```

**Step 2: Add tracks table**

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

**Step 3: Add audioFiles table**

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

**Step 4: Add clips table**

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

**Step 5: Add trackEffects table**

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

**Step 6: Verify types**

Run: `bun check-types --filter=@el-audio-daw/db`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add tracks, audioFiles, clips, trackEffects tables"
```

---

## Task 3: Add Drizzle relations

**Files:**

- Modify: `packages/db/src/schema.ts`

**Step 1: Update projectRelations**

Replace existing projectRelations:

```ts
export const projectRelations = relations(projects, ({ many }) => ({
  users: many(projectUsers),
  tracks: many(tracks),
  audioFiles: many(audioFiles),
  clips: many(clips),
}));
```

**Step 2: Add trackRelations**

```ts
export const trackRelations = relations(tracks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tracks.projectId],
    references: [projects.id],
  }),
  clips: many(clips),
  effects: many(trackEffects),
}));
```

**Step 3: Add audioFileRelations**

```ts
export const audioFileRelations = relations(audioFiles, ({ one, many }) => ({
  project: one(projects, {
    fields: [audioFiles.projectId],
    references: [projects.id],
  }),
  clips: many(clips),
}));
```

**Step 4: Add clipRelations**

```ts
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
```

**Step 5: Add trackEffectRelations**

```ts
export const trackEffectRelations = relations(trackEffects, ({ one }) => ({
  track: one(tracks, {
    fields: [trackEffects.trackId],
    references: [tracks.id],
  }),
}));
```

**Step 6: Verify types**

Run: `bun check-types --filter=@el-audio-daw/db`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add relations for tracks, audioFiles, clips, trackEffects"
```

---

## Task 4: Generate Drizzle migration

**Step 1: Generate migration**

Run: `bun run --filter=@el-audio-daw/db db:push`
or `cd packages/db && bun run db:push`
Expected to succeed

**Step 3: Commit migration**

```bash
git add packages/db/drizzle
git commit -m "chore(db): add migration for new tables"
```

---

## Task 5: Regenerate Zero schema

**Step 1: Run zero:generate**

Run: `bun run --filter=@el-audio-daw/zero zero:generate`
Expected: `packages/zero/src/schema.gen.ts` updated with new tables

**Step 2: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/zero/src/schema.gen.ts
git commit -m "chore(zero): regenerate schema with new tables"
```

---

## Task 6: Add Zero queries for tracks

**Files:**

- Modify: `packages/zero/src/queries.ts`

**Step 1: Add tracks queries**

Add to queries object:

```ts
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
```

**Step 2: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/zero/src/queries.ts
git commit -m "feat(zero): add tracks queries"
```

---

## Task 7: Add Zero queries for audioFiles and clips

**Files:**

- Modify: `packages/zero/src/queries.ts`

**Step 1: Add audioFiles queries**

```ts
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
```

**Step 2: Add clips queries**

```ts
clips: {
  byTrack: defineQuery(
    z.object({ trackId: z.string() }),
    ({ args: { trackId }, ctx: { userID } }) =>
      zql.clips
        .where("trackId", trackId)
        .whereExists("project", (q) =>
          q.whereExists("users", (pu) => pu.where("userId", userID)),
        )
        .related("audioFile"),
  ),
},
```

**Step 3: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/zero/src/queries.ts
git commit -m "feat(zero): add audioFiles and clips queries"
```

---

## Task 8: Add Zero mutators for tracks

**Files:**

- Modify: `packages/zero/src/mutators.ts`

**Step 1: Add tracks mutators**

```ts
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
      for (let i = 0; i < trackIds.length; i++) {
        await tx.mutate.tracks.update({
          id: trackIds[i],
          order: i,
          updatedAt: now,
        });
      }
    },
  ),
},
```

**Step 2: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/zero/src/mutators.ts
git commit -m "feat(zero): add tracks mutators"
```

---

## Task 9: Add Zero mutators for audioFiles

**Files:**

- Modify: `packages/zero/src/mutators.ts`

**Step 1: Add audioFiles mutators**

```ts
audioFiles: {
  create: defineMutator(
    z.object({
      id: z.uuid(),
      projectId: z.string().uuid(),
      storageUrl: z.string().url(),
      waveformUrl: z.string().url().optional(),
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
      waveformUrl: z.string().url(),
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
```

**Step 2: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/zero/src/mutators.ts
git commit -m "feat(zero): add audioFiles mutators"
```

---

## Task 10: Add Zero mutators for clips

**Files:**

- Modify: `packages/zero/src/mutators.ts`

**Step 1: Add clips mutators**

```ts
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
```

**Step 2: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/zero/src/mutators.ts
git commit -m "feat(zero): add clips mutators"
```

---

## Task 11: Add Zero mutators for trackEffects

**Files:**

- Modify: `packages/zero/src/mutators.ts`
- Modify: `packages/zero/package.json` (add schemas dependency)

**Step 1: Add schemas dependency**

In `packages/zero/package.json`, add to dependencies:

```json
"@el-audio-daw/schemas": "workspace:*"
```

**Step 2: Run bun install**

Run: `bun install`

**Step 3: Add import**

Add to top of mutators.ts:

```ts
import { effectDataSchema } from "@el-audio-daw/schemas/effects";
```

**Step 4: Add trackEffects mutators**

```ts
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
      for (let i = 0; i < effectIds.length; i++) {
        await tx.mutate.trackEffects.update({
          id: effectIds[i],
          order: i,
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
```

**Step 5: Verify types**

Run: `bun check-types --filter=@el-audio-daw/zero`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/zero/package.json packages/zero/src/mutators.ts bun.lockb
git commit -m "feat(zero): add trackEffects mutators with effect schema validation"
```

---

## Task 12: Final verification

**Step 1: Run full type check**

Run: `bun check-types`
Expected: No errors across all packages

**Step 2: Run linter**

Run: `bun check`
Expected: No errors

**Step 3: Commit any fixes if needed**
