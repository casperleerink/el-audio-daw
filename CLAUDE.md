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
- **packages/backend**: Convex backend with better-auth for authentication
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

- Convex queries provide real-time sync for projects/tracks
- Optimistic updates for track controls (mute/solo/gain) with rollback on failure
- Audio engine state kept in React refs, synced via useEffect when Convex data changes

**Backend** (`packages/backend/convex/`):

- Schema defines `projects`, `projectUsers`, `tracks` tables
- Tracks ordered by `order` field, reordering updates all affected track orders
- Convex documentation of LLM's: https://docs.convex.dev/llms.txt
- Convex rules, read if doing convex related tasks: `convex_rules.mdc`
