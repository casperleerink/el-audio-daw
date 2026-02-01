# Zero Sync Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Zero sync layer alongside existing Convex for projects/projectUsers tables, with full local development setup.

**Architecture:** New packages (db, auth, zero, api) create a parallel sync stack. Postgres runs in Docker for local dev. zero-cache connects to Hono API server for auth-aware queries and mutators. Frontend gets new Zero hooks alongside existing Convex hooks.

**Tech Stack:** Drizzle ORM, Postgres, better-auth, Zero (Rocicorp), Hono, Docker

---

## Task 1: Create packages/db Package Structure

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`

**Step 1: Create package.json**

Create `packages/db/package.json`:

```json
{
  "name": "@el-audio-daw/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "dev": "bun run ./scripts/dev-postgres.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.44.0",
    "postgres": "^3.4.7"
  },
  "devDependencies": {
    "@el-audio-daw/config": "workspace:*",
    "drizzle-kit": "^0.31.0",
    "typescript": "catalog:"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "@el-audio-daw/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "scripts/**/*", "drizzle.config.ts"]
}
```

**Step 3: Commit**

```bash
git add packages/db/package.json packages/db/tsconfig.json
git commit -m "$(cat <<'EOF'
feat(db): add packages/db structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Drizzle Schema and Client

**Files:**

- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/drizzle.config.ts`

**Step 1: Create schema.ts**

Create `packages/db/src/schema.ts`:

```ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  duration: integer("duration"),
  sampleRate: integer("sample_rate").default(44100),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectUsers = pgTable("project_users", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().$type<"owner" | "collaborator">(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

**Step 2: Create client.ts**

Create `packages/db/src/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type Database = typeof db;
```

**Step 3: Create index.ts**

Create `packages/db/src/index.ts`:

```ts
export { db, type Database } from "./client.js";
export * from "./schema.js";
```

**Step 4: Create drizzle.config.ts**

Create `packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 5: Commit**

```bash
git add packages/db/src packages/db/drizzle.config.ts
git commit -m "$(cat <<'EOF'
feat(db): add Drizzle schema and client

- projects and projectUsers tables
- Postgres client setup
- drizzle-kit configuration

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add Docker Postgres Dev Script

**Files:**

- Create: `packages/db/scripts/dev-postgres.ts`
- Create: `packages/db/.env.example`

**Step 1: Create dev-postgres.ts**

Create `packages/db/scripts/dev-postgres.ts`:

```ts
import { spawn, execSync } from "node:child_process";

const CONTAINER_NAME = "el-audio-daw-postgres";
const POSTGRES_PORT = 5432;
const POSTGRES_USER = "postgres";
const POSTGRES_PASSWORD = "postgres";
const POSTGRES_DB = "el_audio_daw";

function isContainerRunning(): boolean {
  try {
    const result = execSync(
      `docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
      { encoding: "utf-8" }
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function containerExists(): boolean {
  try {
    const result = execSync(
      `docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
      { encoding: "utf-8" }
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function startContainer(): void {
  if (isContainerRunning()) {
    console.log(`✓ Postgres container already running on port ${POSTGRES_PORT}`);
    return;
  }

  if (containerExists()) {
    console.log("Starting existing Postgres container...");
    execSync(`docker start ${CONTAINER_NAME}`, { stdio: "inherit" });
  } else {
    console.log("Creating new Postgres container...");
    execSync(
      `docker run -d \
        --name ${CONTAINER_NAME} \
        -e POSTGRES_USER=${POSTGRES_USER} \
        -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
        -e POSTGRES_DB=${POSTGRES_DB} \
        -p ${POSTGRES_PORT}:5432 \
        postgres:17-alpine`,
      { stdio: "inherit" }
    );
  }

  console.log(`✓ Postgres running on port ${POSTGRES_PORT}`);
  console.log(
    `  DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`
  );
}

function stopContainer(): void {
  if (isContainerRunning()) {
    console.log("\nStopping Postgres container...");
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "inherit" });
    console.log("✓ Postgres stopped");
  }
}

// Start container
startContainer();

// Keep process alive and handle cleanup
console.log("\nPress Ctrl+C to stop Postgres...\n");

process.on("SIGINT", () => {
  stopContainer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopContainer();
  process.exit(0);
});

// Keep alive
setInterval(() => {}, 1000);
```

**Step 2: Create .env.example**

Create `packages/db/.env.example`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/el_audio_daw
```

**Step 3: Commit**

```bash
git add packages/db/scripts packages/db/.env.example
git commit -m "$(cat <<'EOF'
feat(db): add Docker Postgres dev script

- Starts Postgres container on bun dev
- Auto-creates or reuses existing container
- Graceful shutdown on Ctrl+C

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create packages/auth Package

**Files:**

- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`

**Step 1: Create package.json**

Create `packages/auth/package.json`:

```json
{
  "name": "@el-audio-daw/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@el-audio-daw/db": "workspace:*",
    "better-auth": "catalog:"
  },
  "devDependencies": {
    "@el-audio-daw/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/auth/tsconfig.json`:

```json
{
  "extends": "@el-audio-daw/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create src/index.ts**

Create `packages/auth/src/index.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@el-audio-daw/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  trustedOrigins: [
    "http://localhost:3001", // Vite dev server
    "http://localhost:4848", // zero-cache
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
```

**Step 4: Commit**

```bash
git add packages/auth
git commit -m "$(cat <<'EOF'
feat(auth): add packages/auth with better-auth

- Drizzle adapter for Postgres
- Email/password auth enabled
- Cookie session caching

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create packages/zero Package Structure

**Files:**

- Create: `packages/zero/package.json`
- Create: `packages/zero/tsconfig.json`

**Step 1: Create package.json**

Create `packages/zero/package.json`:

```json
{
  "name": "@el-audio-daw/zero",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./queries": "./src/queries.ts",
    "./mutators": "./src/mutators.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@el-audio-daw/db": "workspace:*",
    "@rocicorp/zero": "^0.19.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@el-audio-daw/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/zero/tsconfig.json`:

```json
{
  "extends": "@el-audio-daw/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Commit**

```bash
git add packages/zero/package.json packages/zero/tsconfig.json
git commit -m "$(cat <<'EOF'
feat(zero): add packages/zero structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add Zero Schema

**Files:**

- Create: `packages/zero/src/schema.ts`

**Step 1: Create schema.ts**

Create `packages/zero/src/schema.ts`:

```ts
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
```

**Step 2: Commit**

```bash
git add packages/zero/src/schema.ts
git commit -m "$(cat <<'EOF'
feat(zero): add Zero schema for projects/projectUsers

- Maps to Postgres table names
- Relationships defined for joins
- Type registration for inference

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add Zero Queries

**Files:**

- Create: `packages/zero/src/queries.ts`

**Step 1: Create queries.ts**

Create `packages/zero/src/queries.ts`:

```ts
import { defineQuery, defineQueries, zql } from "@rocicorp/zero";
import { z } from "zod";

export const queries = defineQueries({
  projects: {
    mine: defineQuery(({ ctx: { userID } }) =>
      zql.projectUsers
        .where("userId", userID)
        .related("project")
    ),

    byId: defineQuery(
      z.object({ id: z.string() }),
      ({ args: { id }, ctx: { userID } }) =>
        zql.projects
          .where("id", id)
          .whereExists("projectUsers", (q) => q.where("userId", userID))
          .one()
    ),
  },

  projectUsers: {
    byProject: defineQuery(
      z.object({ projectId: z.string() }),
      ({ args: { projectId }, ctx: { userID } }) =>
        zql.projectUsers
          .where("projectId", projectId)
          .whereExists("project", (q) =>
            q.whereExists("projectUsers", (pu) => pu.where("userId", userID))
          )
    ),
  },
});

export type Queries = typeof queries;
```

**Step 2: Commit**

```bash
git add packages/zero/src/queries.ts
git commit -m "$(cat <<'EOF'
feat(zero): add Zero query definitions

- projects.mine: user's projects via projectUsers
- projects.byId: single project with access check
- projectUsers.byProject: collaborators list

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Zero Mutators

**Files:**

- Create: `packages/zero/src/mutators.ts`

**Step 1: Create mutators.ts**

Create `packages/zero/src/mutators.ts`:

```ts
import { defineMutator, defineMutators, zql } from "@rocicorp/zero";
import { z } from "zod";

export const mutators = defineMutators({
  projects: {
    create: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
      async ({ tx, ctx: { userID }, args: { id, name } }) => {
        const now = new Date().toISOString();

        await tx.mutate.projects.insert({
          id,
          name,
          duration: null,
          sampleRate: 44100,
          createdAt: now,
          updatedAt: now,
        });

        await tx.mutate.projectUsers.insert({
          id: crypto.randomUUID(),
          projectId: id,
          userId: userID,
          role: "owner",
          createdAt: now,
        });
      }
    ),

    update: defineMutator(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
      async ({ tx, ctx: { userID }, args: { id, name } }) => {
        const access = await tx.run(
          zql.projectUsers
            .where("projectId", id)
            .where("userId", userID)
            .one()
        );

        if (!access) {
          throw new Error("Not authorized");
        }

        await tx.mutate.projects.update({
          id,
          name,
          updatedAt: new Date().toISOString(),
        });
      }
    ),

    delete: defineMutator(
      z.object({ id: z.string().uuid() }),
      async ({ tx, ctx: { userID }, args: { id } }) => {
        const access = await tx.run(
          zql.projectUsers
            .where("projectId", id)
            .where("userId", userID)
            .where("role", "owner")
            .one()
        );

        if (!access) {
          throw new Error("Only owner can delete project");
        }

        // Delete projectUsers first (cascade)
        const projectUsers = await tx.run(
          zql.projectUsers.where("projectId", id)
        );

        for (const pu of projectUsers) {
          await tx.mutate.projectUsers.delete({ id: pu.id });
        }

        await tx.mutate.projects.delete({ id });
      }
    ),
  },
});

export type Mutators = typeof mutators;
```

**Step 2: Commit**

```bash
git add packages/zero/src/mutators.ts
git commit -m "$(cat <<'EOF'
feat(zero): add Zero mutator definitions

- projects.create: creates project + owner entry
- projects.update: updates with access check
- projects.delete: owner-only with cascade

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add Zero Package Index

**Files:**

- Create: `packages/zero/src/index.ts`

**Step 1: Create index.ts**

Create `packages/zero/src/index.ts`:

```ts
export { schema, type Schema } from "./schema.js";
export { queries, type Queries } from "./queries.js";
export { mutators, type Mutators } from "./mutators.js";
```

**Step 2: Commit**

```bash
git add packages/zero/src/index.ts
git commit -m "$(cat <<'EOF'
feat(zero): add package index exports

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create packages/api Package Structure

**Files:**

- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`

**Step 1: Create package.json**

Create `packages/api/package.json`:

```json
{
  "name": "@el-audio-daw/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@el-audio-daw/auth": "workspace:*",
    "@el-audio-daw/db": "workspace:*",
    "@el-audio-daw/zero": "workspace:*",
    "@hono/node-server": "^1.14.3",
    "hono": "^4.7.10"
  },
  "devDependencies": {
    "@el-audio-daw/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/api/tsconfig.json`:

```json
{
  "extends": "@el-audio-daw/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Commit**

```bash
git add packages/api/package.json packages/api/tsconfig.json
git commit -m "$(cat <<'EOF'
feat(api): add packages/api structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add Hono API Server

**Files:**

- Create: `packages/api/src/index.ts`
- Create: `packages/api/src/auth.ts`
- Create: `packages/api/src/zero.ts`

**Step 1: Create auth.ts**

Create `packages/api/src/auth.ts`:

```ts
import { Hono } from "hono";
import { auth } from "@el-audio-daw/auth";

export const authRoutes = new Hono();

authRoutes.on(["GET", "POST"], "/*", (c) => {
  return auth.handler(c.req.raw);
});
```

**Step 2: Create zero.ts**

Create `packages/api/src/zero.ts`:

```ts
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { auth } from "@el-audio-daw/auth";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import {
  handleQueryRequest,
  handleMutateRequest,
} from "@rocicorp/zero/server";
import { db } from "@el-audio-daw/db";

export const zeroRoutes = new Hono();

async function getContext(c: any) {
  const sessionToken = getCookie(c, "better-auth.session_token");

  if (!sessionToken) {
    return { userID: "" };
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return { userID: "" };
  }

  return { userID: session.user.id };
}

zeroRoutes.post("/query", async (c) => {
  const ctx = await getContext(c);

  return handleQueryRequest({
    request: c.req.raw,
    queries,
    context: ctx,
  });
});

zeroRoutes.post("/mutate", async (c) => {
  const ctx = await getContext(c);

  if (!ctx.userID) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return handleMutateRequest({
    request: c.req.raw,
    mutators,
    context: ctx,
    getDB: () => db,
  });
});
```

**Step 3: Create index.ts**

Create `packages/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./auth.js";
import { zeroRoutes } from "./zero.js";

const app = new Hono();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001", "http://localhost:4848"],
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/zero", zeroRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ API server running at http://localhost:${port}`);
```

**Step 4: Commit**

```bash
git add packages/api/src
git commit -m "$(cat <<'EOF'
feat(api): add Hono API server

- /api/auth/* - better-auth routes
- /api/zero/query - Zero query handler
- /api/zero/mutate - Zero mutate handler
- Session-based auth context

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Add zero-cache Configuration

**Files:**

- Create: `packages/zero-cache/package.json`
- Create: `packages/zero-cache/.env.example`

**Step 1: Create package.json**

Create `packages/zero-cache/package.json`:

```json
{
  "name": "@el-audio-daw/zero-cache",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx zero-cache"
  }
}
```

**Step 2: Create .env.example**

Create `packages/zero-cache/.env.example`:

```bash
# Postgres connection (same as packages/db)
ZERO_UPSTREAM_DB=postgres://postgres:postgres@localhost:5432/el_audio_daw

# API server endpoints
ZERO_QUERY_URL=http://localhost:3000/api/zero/query
ZERO_MUTATE_URL=http://localhost:3000/api/zero/mutate

# Forward cookies for auth
ZERO_QUERY_FORWARD_COOKIES=true
ZERO_MUTATE_FORWARD_COOKIES=true

# Port
ZERO_PORT=4848
```

**Step 3: Commit**

```bash
git add packages/zero-cache
git commit -m "$(cat <<'EOF'
feat(zero-cache): add zero-cache package configuration

- npx zero-cache dev script
- Environment variables for API integration
- Cookie forwarding for auth

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update Turbo Configuration

**Files:**

- Modify: `turbo.json`

**Step 1: Update turbo.json**

Read `turbo.json` first, then update to add dependencies between new packages:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^dev"]
    },
    "dev:setup": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Step 2: Commit**

```bash
git add turbo.json
git commit -m "$(cat <<'EOF'
chore: update turbo.json with dev dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Update Root Package Scripts

**Files:**

- Modify: `package.json`

**Step 1: Update package.json**

Add new scripts and workspace dependencies. Read the file first, then add:

In scripts section, add:

```json
"dev:db": "turbo run dev --filter=@el-audio-daw/db",
"dev:api": "turbo run dev --filter=@el-audio-daw/api",
"dev:zero": "turbo run dev --filter=@el-audio-daw/zero-cache"
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore: add dev scripts for Zero packages

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Install Dependencies

**Step 1: Run bun install**

```bash
bun install
```

**Step 2: Verify installation**

```bash
bun check-types
```

Expected: Types check passes (may have some warnings for unused packages)

**Step 3: Commit lockfile**

```bash
git add bun.lockb
git commit -m "$(cat <<'EOF'
chore: update lockfile with Zero dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Run Database Migration

**Step 1: Start Postgres**

```bash
cd packages/db && bun dev &
```

Wait for "✓ Postgres running" message.

**Step 2: Create .env file**

```bash
echo "DATABASE_URL=postgres://postgres:postgres@localhost:5432/el_audio_daw" > packages/db/.env
```

**Step 3: Run migration**

```bash
cd packages/db && bun db:push
```

Expected: Tables created successfully

**Step 4: Verify tables exist**

```bash
docker exec el-audio-daw-postgres psql -U postgres -d el_audio_daw -c "\dt"
```

Expected: Should show `projects` and `project_users` tables

**Step 5: Commit .env to .gitignore if not already**

```bash
echo "packages/db/.env" >> .gitignore
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: add packages/db/.env to gitignore

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Add Frontend Zero Provider

**Files:**

- Create: `apps/web/src/lib/zero-client.ts`
- Create: `apps/web/src/components/ZeroProvider.tsx`

**Step 1: Create zero-client.ts**

Create `apps/web/src/lib/zero-client.ts`:

```ts
import { Zero } from "@rocicorp/zero";
import { schema } from "@el-audio-daw/zero/schema";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";

export function createZeroClient(userID: string) {
  return new Zero({
    userID,
    server: "http://localhost:4848",
    schema,
    queries,
    mutators,
  });
}

export type ZeroClient = ReturnType<typeof createZeroClient>;
```

**Step 2: Create ZeroProvider.tsx**

Create `apps/web/src/components/ZeroProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ZeroProvider as ZeroReactProvider } from "@rocicorp/zero/react";
import { createZeroClient, type ZeroClient } from "@/lib/zero-client";
import { authClient } from "@/lib/auth-client";

const ZeroContext = createContext<ZeroClient | null>(null);

export function useZeroClient() {
  const client = useContext(ZeroContext);
  if (!client) {
    throw new Error("useZeroClient must be used within ZeroProvider");
  }
  return client;
}

interface ZeroProviderProps {
  children: ReactNode;
}

export function ZeroProvider({ children }: ZeroProviderProps) {
  const [zero, setZero] = useState<ZeroClient | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const userID = session?.user?.id ?? "";

    if (zero) {
      // Cleanup previous instance
      zero.close();
    }

    const client = createZeroClient(userID);
    setZero(client);

    return () => {
      client.close();
    };
  }, [session?.user?.id]);

  if (!zero) {
    return null;
  }

  return (
    <ZeroContext.Provider value={zero}>
      <ZeroReactProvider zero={zero}>{children}</ZeroReactProvider>
    </ZeroContext.Provider>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/zero-client.ts apps/web/src/components/ZeroProvider.tsx
git commit -m "$(cat <<'EOF'
feat(web): add Zero client and provider

- createZeroClient factory function
- ZeroProvider with session-aware userID
- useZeroClient hook for accessing client

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Update Frontend Dependencies

**Files:**

- Modify: `apps/web/package.json`

**Step 1: Add Zero dependency**

Read `apps/web/package.json`, then add to dependencies:

```json
"@el-audio-daw/zero": "workspace:*",
"@rocicorp/zero": "^0.19.0"
```

**Step 2: Run bun install**

```bash
bun install
```

**Step 3: Commit**

```bash
git add apps/web/package.json bun.lockb
git commit -m "$(cat <<'EOF'
feat(web): add Zero dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Add Zero Project Hooks

**Files:**

- Create: `apps/web/src/hooks/useZeroProjects.ts`

**Step 1: Create useZeroProjects.ts**

Create `apps/web/src/hooks/useZeroProjects.ts`:

```ts
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";

export function useZeroProjects() {
  const zero = useZero();
  const projectUsers = useQuery(queries.projects.mine());

  const projects = projectUsers.map((pu) => pu.project).filter(Boolean);

  const createProject = async (name: string) => {
    await zero.mutate(
      mutators.projects.create({
        id: crypto.randomUUID(),
        name,
      })
    );
  };

  const updateProject = async (id: string, name: string) => {
    await zero.mutate(mutators.projects.update({ id, name }));
  };

  const deleteProject = async (id: string) => {
    await zero.mutate(mutators.projects.delete({ id }));
  };

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useZeroProjects.ts
git commit -m "$(cat <<'EOF'
feat(web): add useZeroProjects hook

- Lists user's projects via Zero
- Create, update, delete mutations
- Optimistic updates via Zero

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Integrate Zero Provider in App

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`

**Step 1: Read current \_\_root.tsx**

Read the file to understand existing structure.

**Step 2: Add ZeroProvider wrapper**

Add import:

```ts
import { ZeroProvider } from "@/components/ZeroProvider";
```

Wrap existing providers with ZeroProvider (inside ConvexBetterAuthProvider, outside other content):

```tsx
<ConvexBetterAuthProvider client={convex} authClient={authClient}>
  <ZeroProvider>
    {/* existing content */}
  </ZeroProvider>
</ConvexBetterAuthProvider>
```

**Step 3: Commit**

```bash
git add apps/web/src/routes/__root.tsx
git commit -m "$(cat <<'EOF'
feat(web): integrate ZeroProvider in app root

Zero now runs alongside Convex

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Add Environment Variables to packages/api

**Files:**

- Create: `packages/api/.env.example`

**Step 1: Create .env.example**

Create `packages/api/.env.example`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/el_audio_daw
PORT=3000
```

**Step 2: Commit**

```bash
git add packages/api/.env.example
git commit -m "$(cat <<'EOF'
docs(api): add .env.example

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Update env Package for Zero URLs

**Files:**

- Modify: `packages/env/src/web.ts`

**Step 1: Add Zero environment variables**

Read `packages/env/src/web.ts`, then add to client config:

```ts
VITE_ZERO_URL: z.url().optional(),
```

**Step 2: Commit**

```bash
git add packages/env/src/web.ts
git commit -m "$(cat <<'EOF'
feat(env): add VITE_ZERO_URL environment variable

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: Verify Full Stack Works

**Step 1: Start all services**

Terminal 1 - Postgres:

```bash
cd packages/db && bun dev
```

Terminal 2 - API server:

```bash
cd packages/api && bun dev
```

Terminal 3 - zero-cache:

```bash
cd packages/zero-cache && bun dev
```

Terminal 4 - Frontend:

```bash
cd apps/web && bun dev
```

**Step 2: Create test user and project**

1. Open http://localhost:3001
2. Sign up with email/password
3. Verify Zero connection in browser devtools (Network tab shows WebSocket to localhost:4848)

**Step 3: Test Zero queries**

Open browser console and check for Zero sync activity.

---

## Task 24: Run Type Check

**Step 1: Run full type check**

```bash
bun check-types
```

Expected: All packages pass type checking

**Step 2: Fix any type errors**

If errors occur, fix them in the relevant package.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: resolve type errors from Zero integration

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Add Zero section**

Add after Backend section:

```markdown
**Zero Sync** (`packages/zero/`, `packages/db/`, `packages/api/`):

- Use `zero-sync` skill when working with Zero code
- Schema in `packages/zero/src/schema.ts` - maps to Postgres tables
- Queries in `packages/zero/src/queries.ts` - use `defineQuery` with Zod args
- Mutators in `packages/zero/src/mutators.ts` - use `defineMutator` with access checks
- API server in `packages/api/` handles auth context extraction
- Frontend hooks in `apps/web/src/hooks/useZero*.ts`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add Zero sync section to CLAUDE.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

This plan creates:

1. **packages/db** - Drizzle schema, Postgres client, Docker dev script
2. **packages/auth** - better-auth with Drizzle adapter
3. **packages/zero** - Zero schema, queries, mutators
4. **packages/api** - Hono server with auth and Zero endpoints
5. **packages/zero-cache** - zero-cache configuration
6. **apps/web updates** - ZeroProvider, hooks, integration

All Convex code remains untouched. Zero runs in parallel for validation.
