# Dev workflow

Local development uses Docker Compose for all external dependencies (Postgres, MinIO) and a one-shot `db:reset` that rebuilds the schema and seeds a working project — including audio files uploaded to local object storage.

## External services (Docker Compose)

`docker-compose.yml` at the repo root defines:

| Service      | Port(s)        | Purpose                                             |
| ------------ | -------------- | --------------------------------------------------- |
| `postgres`   | `5435 → 5432`  | Primary database (matches `DATABASE_URL`)           |
| `minio`      | `9000`, `9001` | S3-compatible object storage (`9001` is the web UI) |
| `minio-init` | one-shot       | Creates the `el-audio-daw` bucket on first boot     |

```bash
bun db:up      # start postgres + minio
bun db:down    # stop containers (data persists in named volumes)
bun db:nuke    # stop + delete volumes (full wipe)
```

MinIO console: http://localhost:9001 (login `minioadmin` / `minioadmin`).

## Object storage (S3-compatible)

The codebase uses **one** generic S3 client — no R2-specific branching. Switching between MinIO (dev) and R2 (prod) is purely an env-var change.

Env vars (defined in `packages/env/src/api.ts`):

```
STORAGE_ENDPOINT          # http://localhost:9000  |  https://<acct>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_BUCKET_NAME
STORAGE_REGION            # "auto" works for both R2 and MinIO
```

Client lives in `packages/api/src/storage.ts`. `forcePathStyle: true` is always on (works for both providers).

## Reset & reseed

```bash
bun db:reset   # drop schema → drizzle-kit push → clear Zero replica → seed
bun db:seed    # seed only (assumes schema exists)
```

`db:reset` (`packages/api/scripts/reset.ts`) does:

1. `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` plus drops Zero's publications (`_zero_public_0`, `_zero_metadata_0`) and metadata schemas (`zero`, `zero_0`) — they reference table OIDs that don't survive the schema drop
2. `drizzle-kit push --force` against `packages/db/drizzle.config.ts`
3. Removes `/tmp/zero-replica.db*` so Zero rebuilds clean
4. Runs `seed.ts`

After reset, **restart `bun dev`** — zero-cache won't pick up the schema swap on its own.

## Seed contents

`packages/api/scripts/seed.ts` creates:

- A dev user via `auth.api.signUpEmail` — login `dev@example.com` / `password123`
- One "Demo Project" owned by that user
- Two tracks (Bass, Drums)
- Three samples (`bass-sine.wav`, `kick.wav`, `hat.wav`) uploaded to MinIO under `projects/<id>/audio/...`
- Three clips placed sequentially on the corresponding tracks

User creation goes through Better Auth's API (not direct inserts) so password hashing and account rows stay correct. The seed is idempotent on the user (skips signup if `dev@example.com` exists) but **not** on projects — repeated `db:seed` runs create new projects each time. Use `db:reset` for a clean slate.

## Seed audio assets

`packages/api/seed/assets/*.wav` are committed binary WAVs (~250 KB total), generated programmatically by `packages/api/scripts/generate-assets.ts`:

- `bass-sine.wav` — 2s sine bass at 110 Hz with attack/release envelope
- `kick.wav` — 0.6s exponential pitch-decayed sine kick
- `hat.wav` — 0.3s high-passed white noise burst

To regenerate (e.g. after editing the synthesis code):

```bash
bun run --cwd packages/api db:generate-assets
```

To swap in real recorded samples, just replace the WAV files at the same paths — the seed reads any valid PCM WAV and parses sample-rate / channels / duration from the header.

## When schema changes

Typical loop:

1. Edit `packages/db/src/schema.ts`
2. `bun db:reset` (drops, pushes, reseeds — ~5s)
3. `bun zero:generate` if Zero schema needs to follow (`packages/zero/src/schema.gen.ts`)
4. Restart `bun dev`

`drizzle-kit push` is preferred over migrations during dev — it keeps the schema file as the single source of truth. Generate proper migrations (`drizzle-kit generate`) before anything ships to a shared/prod database.

## Switching to production storage

Replace the `STORAGE_*` block in `packages/api/.env` with R2 (or any S3-compatible) credentials. No code changes. The commented-out R2 block in `packages/api/.env` shows the shape.
