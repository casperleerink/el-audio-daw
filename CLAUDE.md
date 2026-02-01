# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun check            # Lint with oxlint and format with oxfmt
bun check-types      # TypeScript type checking across all packages
```

## Architecture

This is a monorepo (Bun workspaces + Turbo) for an audio DAW web application.

### Packages

- **apps/web**: React 19 frontend with Vite, TanStack Router, Tailwind CSS v4, and Base UI components
- **packages/audio**: Audio engine using Elementary Audio (`@elemaudio/core`, `@elemaudio/web-renderer`) for real-time DSP
- **packages/zero**: Zero sync backend for local-first server state
- **packages/env**: Shared environment variable validation (Zod)
- **packages/config**: Shared TypeScript/tooling configs

### Key Patterns

**Audio Engine** (`packages/audio/src/engine.ts`):

- Use `elementary-audio` skill when working in the audio engine
- `AudioEngine` class wraps Elementary Audio's `WebRenderer`
- Functional, declarative DSP graph: tracks summed through `el.add()`, gains applied with `el.mul()` and smoothing via `el.sm()`
- Must initialize after user gesture (browser autoplay policy)
- Tracks have mute/solo/gain; solo takes precedence over mute

**Frontend State**:

- Zero sync queries provide real-time sync for all server data
- Keep global UI state either in tanstack router URL or in zustand store
- Audio engine state kept in React refs, synced via useEffect when data changes

**React Components**:

- Keep components small and focused on a single responsibility
- Use composition over large monolithic components - break down into smaller pieces
- Extract business logic into custom hooks, keep components focused on rendering
- Avoid mixing unrelated concerns in the same component

**Zero Sync** (`packages/zero/`, `packages/db/`, `packages/api/`):

- Use `zero-sync` skill when working with Zero code
- Schema in `packages/zero/src/schema.gen.ts` - auto-generated from Drizzle, maps to Postgres tables
- Queries in `packages/zero/src/queries.ts` - use `defineQuery` with Zod args
- Mutators in `packages/zero/src/mutators.ts` - use `defineMutator` with access checks
- API server in `packages/api/` handles auth context extraction
- Frontend hooks in `apps/web/src/hooks/useZero*.ts`

**Typescript**

- Avoid `any`
- Avoid `as` type casting unless absolute necessary
- Infer types
