# Zero Sync Migration Design

Migration from Convex to Zero for real-time data sync. This design adds Zero infrastructure alongside existing Convex code without removing anything.

## Goals

- Add Zero sync layer as parallel to Convex
- Validate Zero works before removing Convex
- Start with minimal scope (projects + projectUsers tables)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                       (apps/web)                             │
│  ┌─────────────────┐          ┌─────────────────┐           │
│  │  Convex hooks   │          │   Zero hooks    │           │
│  │   (existing)    │          │     (new)       │           │
│  └────────┬────────┘          └────────┬────────┘           │
└───────────┼────────────────────────────┼────────────────────┘
            │                            │
            ▼                            ▼
     ┌──────────┐              ┌──────────────┐
     │  Convex  │              │  zero-cache  │
     │  Cloud   │              │ :4848        │
     └──────────┘              └──────┬───────┘
                                      │
                          ┌───────────┴───────────┐
                          │    /api/zero/query    │
                          │    /api/zero/mutate   │
                          ▼                       ▼
                    ┌─────────────────────────────────┐
                    │         Hono API Server         │
                    │         (packages/api)          │
                    │           :3000                 │
                    │  ┌───────────┐ ┌─────────────┐  │
                    │  │   Auth    │ │ Zero Query  │  │
                    │  │  Routes   │ │ & Mutate    │  │
                    │  └─────┬─────┘ └──────┬──────┘  │
                    └────────┼──────────────┼─────────┘
                             │              │
                             ▼              ▼
                    ┌─────────────────────────────────┐
                    │           Postgres              │
                    │      (Docker, local dev)        │
                    └─────────────────────────────────┘
```

## New Packages

### packages/db

Drizzle schema and Postgres client. Shared foundation for auth and Zero.

**Responsibilities:**

- Drizzle table definitions
- Database client setup
- Migrations via drizzle-kit
- Dev script: starts/stops Postgres container

**Dependencies:**

- `drizzle-orm`
- `drizzle-kit`
- `postgres` (node-postgres)

### packages/auth

better-auth with Postgres adapter.

**Responsibilities:**

- better-auth instance configuration
- Session management
- Cookie-based auth (forwarded to zero-cache)

**Dependencies:**

- `better-auth`
- `@el-audio-daw/db`

### packages/zero

Zero schema, queries, and mutators.

**Responsibilities:**

- Zero schema (generated from Drizzle via `@rocicorp/zero-drizzle`)
- Query definitions using `defineQuery`
- Mutator definitions using `defineMutator`
- Exported for use by both API server and frontend

**Dependencies:**

- `@rocicorp/zero`
- `@rocicorp/zero-drizzle`
- `@el-audio-daw/db`
- `zod`

### packages/api

Hono server implementing Zero endpoints and auth.

**Responsibilities:**

- `/api/zero/query` - Query resolution for zero-cache
- `/api/zero/mutate` - Mutation execution for zero-cache
- `/api/auth/*` - better-auth routes
- Cookie middleware for auth

**Dependencies:**

- `hono`
- `@el-audio-daw/auth`
- `@el-audio-daw/zero`
- `@el-audio-daw/db`

## Database Schema (Drizzle)

Initial scope: `projects` and `projectUsers` tables only.

```ts
// packages/db/src/schema.ts
import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),              // Client-generated UUID
  name: text('name').notNull(),
  duration: integer('duration').notNull(),  // in samples
  sampleRate: integer('sample_rate').notNull().default(44100),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const projectUsers = pgTable('project_users', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  userId: text('user_id').notNull(),        // References auth user
  role: text('role').notNull(),             // 'owner' | 'collaborator'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

## Zero Layer

**Schema:** Auto-generated from Drizzle via `@rocicorp/zero-drizzle`.

**Queries:**

- `projects.mine` - User's projects via projectUsers relationship
- `projects.byId` - Single project with access check
- `projectUsers.byProject` - Collaborators for a project

**Mutators:**

- `projects.create` - Creates project + adds creator as owner
- `projects.update` - Updates project name
- `projects.delete` - Cascading delete (projectUsers first)

All queries use `ctx.userID` for access control. All mutators validate via Zod schemas.

## API Server Endpoints

### Query Endpoint

```
POST /api/zero/query
```

- Receives query name + args from zero-cache
- Uses `handleQueryRequest` helper from `@rocicorp/zero`
- Returns ZQL AST for zero-cache to execute

### Mutate Endpoint

```
POST /api/zero/mutate
```

- Receives mutation name + args from zero-cache
- Uses `handleMutateRequest` helper with Postgres connection
- Executes mutations against Postgres

### Auth Endpoints

```
/api/auth/*
```

- better-auth routes for login/logout/session
- Sets cookies with `Domain` for zero-cache forwarding

## Environment Variables

### zero-cache

```bash
ZERO_UPSTREAM_DB=postgres://user:pass@localhost:5432/el_audio_daw
ZERO_QUERY_URL=http://localhost:3000/api/zero/query
ZERO_MUTATE_URL=http://localhost:3000/api/zero/mutate
ZERO_QUERY_FORWARD_COOKIES=true
ZERO_MUTATE_FORWARD_COOKIES=true
```

### API Server

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/el_audio_daw
```

## Local Development Setup

Single command starts everything:

```bash
bun dev
```

Turborepo orchestrates startup order:

```
bun dev
├── packages/db     → Starts Postgres container (stops on exit)
├── packages/api    → Hono dev server (localhost:3000)
├── zero-cache      → Zero sync server (localhost:4848)
└── apps/web        → Vite dev server (localhost:5173)
```

**Turbo dependencies:**

- `api` depends on `db` (needs Postgres running)
- `zero-cache` depends on `db` and `api` (needs both ready)
- `web` depends on `zero-cache` (needs sync available)

## Frontend Integration

Changes to `apps/web`:

1. Add `ZeroProvider` wrapper (alongside existing Convex provider)
2. Create Zero client setup with schema, queries, mutators
3. New hooks using `useQuery` from `@rocicorp/zero/react`
4. Feature flag or route-based switch between Convex and Zero
5. Keep all Convex code intact until Zero is validated

Frontend imports types from `@el-audio-daw/zero` for type safety.

## Future Considerations

### File Storage

When ready to migrate audio file uploads:

- Cloudflare R2 (recommended) - S3-compatible, no egress fees
- Add upload routes to API server
- Presigned URL pattern matching current Convex flow

### Additional Tables

After validating projects/projectUsers:

- tracks
- clips
- audioFiles
- trackEffects

### Production Deployment

- Managed Postgres (Neon recommended)
- Zero Cloud or self-hosted zero-cache
- API server on Cloudflare Workers, Vercel, or similar

## Package Dependency Graph

```
db ◄─── auth
 │
 ├───► zero
 │
 └───► api ◄─── auth
         │
         └───► zero

apps/web ◄─── zero (types + queries)
```
