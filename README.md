# el-audio-daw

> **⚠️ Experimental / Alpha**
>
> This project is in early development and should not be used for serious work. APIs and features may change without notice. Use at your own risk.

A browser-based Digital Audio Workstation (DAW) built with [Elementary Audio](https://www.elementary.audio/) for real-time DSP processing.

## About

el-audio-daw is a collaborative audio workstation that runs entirely in the browser. It uses Elementary Audio's functional, declarative approach to audio DSP, enabling low-latency audio processing through WebAudio.

### Current Features

- **Multi-track audio** - Create and manage multiple audio tracks with individual gain, mute, and solo controls
- **Real-time collaboration** - Projects sync in real-time across clients via Convex
- **Audio file upload** - Upload and play audio clips on tracks
- **Optimistic UI** - Responsive controls with instant feedback and automatic rollback on errors

## Tech Stack

- **Audio Engine**: Elementary Audio (`@elemaudio/core`, `@elemaudio/web-renderer`)
- **Frontend**: React 19, Vite, TanStack Router, Tailwind CSS v4
- **Backend**: Convex (real-time sync + file storage)
- **Auth**: Better-Auth
- **Monorepo**: Bun workspaces + Turborepo

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Convex Setup

This project uses Convex as a backend. You'll need to set up Convex before running the app:

```bash
bun run dev:setup
```

Follow the prompts to create a new Convex project and connect it to your application.

Copy environment variables from `packages/backend/.env.local` to `apps/*/.env`.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
el-audio-daw/
├── apps/
│   └── web/         # Frontend application (React + TanStack Router)
├── packages/
│   ├── audio/       # Audio engine using Elementary Audio for real-time DSP
│   ├── backend/     # Convex backend functions and schema
│   ├── config/      # Shared TypeScript/tooling configs
│   └── env/         # Shared environment variable validation
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:setup`: Setup and configure your Convex project
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Oxlint and Oxfmt
