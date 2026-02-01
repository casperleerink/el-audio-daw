# el-audio-daw

> **⚠️ Experimental / Alpha**
>
> This project is in early development and should not be used for serious work. APIs and features may change without notice. Use at your own risk.

A browser-based Digital Audio Workstation (DAW) built with [Elementary Audio](https://www.elementary.audio/) for real-time DSP processing.

## About

el-audio-daw is a collaborative audio workstation that runs entirely in the browser. It uses Elementary Audio's functional, declarative approach to audio DSP, enabling low-latency audio processing through WebAudio.

### Current Features

- **Multi-track audio** - Create and manage multiple audio tracks with individual gain, mute, and solo controls
- **Real-time collaboration** - Projects sync in real-time across clients via Zero
- **Audio file upload** - Upload and play audio clips on tracks
- **Optimistic UI** - Responsive controls with instant feedback and automatic rollback on errors

## Tech Stack

- **Audio Engine**: Elementary Audio (`@elemaudio/core`, `@elemaudio/web-renderer`)
- **Frontend**: React 19, Vite, TanStack Router, Tailwind CSS v4
- **Backend**: Hono API server, PostgreSQL with Drizzle ORM
- **Sync**: Zero (real-time sync engine)
- **Auth**: Better-Auth
- **Monorepo**: Bun workspaces + Turborepo

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Zero for real-time sync. You'll need to set up the database before running the app.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
el-audio-daw/
├── apps/
│   └── web/         # Frontend application (React + TanStack Router)
├── packages/
│   ├── api/         # Hono API server for Zero sync and file uploads
│   ├── audio/       # Audio engine using Elementary Audio for real-time DSP
│   ├── auth/        # Better-Auth configuration
│   ├── config/      # Shared TypeScript/tooling configs
│   ├── db/          # PostgreSQL database with Drizzle ORM
│   ├── env/         # Shared environment variable validation
│   ├── schemas/     # Shared Zod schemas for validation
│   └── zero/        # Zero sync engine for real-time data replication
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:api`: Start the API server
- `bun run dev:db`: Start Drizzle Studio for database management
- `bun run dev:zero`: Start the Zero cache server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Oxlint and Oxfmt
