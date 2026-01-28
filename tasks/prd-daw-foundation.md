# PRD: DAW Foundation

## Overview

Build the foundational architecture for a collaborative DAW (Digital Audio Workstation) using Elementary Audio. This version establishes the core timeline, transport controls, track system, and audio routing without audio clips or effects.

**Key constraints:**

- Time-based timeline (no measures/meters) - architecture must support adding tempo/meter later
- Real-time collaboration via Convex
- Elementary Audio for all audio processing use the "elementary-audio" skill for tasks involving audio processing.

## Goals

- Functional timeline with playhead, zoom, and scroll
- Working transport (play/stop) with global clock
- Track system with mute/solo/gain routed to master
- Persistent project state in Convex with multi-user support
- Audio engine architecture ready for clips/effects in future versions

## Tasks

- [x] Create `packages/audio` with Elementary Audio (web-renderer + core)
- [x] Set up audio engine with master output and track routing
- [x] Create Convex schema (Project, Track, ProjectUser)
- [ ] Build project dashboard page (`/`)
- [ ] Build DAW editor page (`/project/:id`)
- [ ] Implement timeline canvas with zoom/scroll
- [ ] Implement track list with TanStack Virtual
- [ ] Implement transport controls (play/stop, clock display)
- [ ] Implement track controls (mute/solo/gain)
- [ ] Implement master track with gain
- [ ] Implement track reordering via drag-and-drop
- [ ] Implement project settings modal (rename project)
- [ ] Implement keyboard shortcuts (spacebar, Cmd+T)
- [ ] Wire up real-time Convex sync for tracks

## Functional Requirements

### Audio Engine (packages/audio)

**FR-1** Package exports `AudioEngine` class using `@elemaudio/web-renderer` and `@elemaudio/core`

**FR-2** `AudioEngine.initialize()` creates AudioContext and initializes Elementary renderer. Called when user enters project (requires user gesture)

**FR-3** `AudioEngine.play()` starts playback from current playhead position

**FR-4** `AudioEngine.stop()` stops playback and keeps playhead at current position

**FR-5** `AudioEngine.setPlayhead(timeInSeconds)` sets playhead position

**FR-6** `AudioEngine.getPlayhead()` returns current playhead position in seconds

**FR-7** Engine maintains internal clock that advances during playback, accessible via callback or polling

**FR-8** Engine accepts track state: `{ id, muted, solo, gain }[]` and master gain

**FR-9** When solo is active on any track, only soloed tracks produce audio

**FR-10** Track gain range: -60dB to +12dB, with -Infinity for complete silence below -60dB

**FR-11** All track outputs sum to master track, master gain applied before output

**FR-12** Stereo output (2 channels)

**FR-13** Use Elementary Audio default sample rate and buffer size

### Convex Schema

**FR-14** `projects` table:

```
id, name, createdAt, updatedAt
```

**FR-15** `projectUsers` table:

```
id, projectId, userId, role ("owner" | "collaborator"), joinedAt
```

**FR-16** `tracks` table:

```
id, projectId, name, order, muted, solo, gain, createdAt, updatedAt
```

**FR-17** Mutations: `createProject`, `updateProject`, `deleteProject`, `createTrack`, `updateTrack`, `deleteTrack`, `reorderTracks`

**FR-18** Queries: `getProject`, `getUserProjects`, `getProjectTracks`

**FR-19** Real-time subscriptions for tracks (changes sync immediately to all collaborators)

### Routes

**FR-20** `/` - Dashboard showing user's projects with "New Project" button

**FR-21** `/project/:id` - DAW editor, initializes audio context on entry

**FR-22** Redirect unauthenticated users to login

### Dashboard (`/`)

**FR-23** Display list of projects user owns or collaborates on

**FR-24** "New Project" button creates project and navigates to editor

**FR-25** Each project card shows name and "Open" action

### DAW Editor (`/project/:id`)

**FR-26** Layout: Track headers (left panel, DOM) + Timeline canvas (right panel, Canvas 2D)

**FR-27** Track headers and timeline rows stay vertically aligned during scroll

**FR-28** Initialize AudioEngine when component mounts (after user gesture)

#### Timeline

**FR-29** Canvas 2D rendering for timeline content area

**FR-30** Horizontal axis = time in seconds, vertical axis = tracks

**FR-31** Default view: 1 minute visible (0:00 to 1:00)

**FR-32** Zoom: scroll wheel (or pinch) changes pixels-per-second. Minimal min/max limits (like Ableton)

**FR-33** Horizontal scroll: shift+scroll or horizontal trackpad gesture

**FR-34** Time ruler at top showing time markers (0:00, 0:30, 1:00 etc). Marker density adjusts with zoom level, always evenly spaced

**FR-35** Playhead: vertical gray line at current time position

**FR-36** Click on timeline sets playhead position

**FR-37** Playhead moves smoothly during playback (use requestAnimationFrame)

#### Track List

**FR-38** Use TanStack Virtual to virtualize track rows (only render visible tracks)

**FR-39** Track header contains: name (editable), mute button, solo button, gain slider

**FR-40** Default track name: "Track 1", "Track 2", etc (incrementing)

**FR-41** Mute button: toggles `muted` state, visual indicator when active

**FR-42** Solo button: toggles `solo` state, visual indicator when active. Multiple tracks can be soloed

**FR-43** Gain slider: -60dB to +12dB range, show current dB value

**FR-44** "Add Track" button creates new track at bottom of list

**FR-45** Drag-and-drop to reorder tracks, updates `order` field in Convex

**FR-46** Delete track button on each track header (no confirmation needed)

#### Master Track

**FR-47** Master track always visible at bottom of track list (not virtualized)

**FR-48** Master track shows: label "Master", gain slider only (no mute/solo)

**FR-49** Master gain range same as tracks (-60dB to +12dB)

#### Transport Controls

**FR-50** Transport bar at top or bottom of editor (sticky)

**FR-51** Play button: starts playback, icon changes to pause/stop icon

**FR-52** Stop button: stops playback

**FR-53** Spacebar toggles play/stop

**FR-54** Clock display shows current playhead time in `M:SS.mmm` format (e.g., `1:23.456`)

**FR-55** Clock updates in real-time during playback

#### Project Settings

**FR-56** Settings button in editor header opens project settings modal

**FR-57** Project settings modal allows renaming project

#### Keyboard Shortcuts

**FR-58** Spacebar: toggle play/stop

**FR-59** Cmd+T (Ctrl+T on Windows): add new track

### State Management

**FR-60** Track data (name, muted, solo, gain, order) stored in Convex, synced real-time

**FR-61** Playhead position stored locally (not in Convex) - each user has independent playhead

**FR-62** Audio engine state (playing/stopped) stored locally

**FR-63** Optimistic updates for track changes (UI updates immediately, syncs to Convex)

## Non-Goals

- Audio clips/regions (future version)
- Audio effects/plugins (future version)
- Recording (future version)
- Waveform display (future version)
- Tempo/BPM/time signatures (future version, but architecture should not prevent it)
- Loop regions (future version)
- Undo/redo (future version)
- Mobile/touch optimization
- Offline support
- Audio file import

## Technical Considerations

### Tech Stack

- Vite + React
- TanStack Router
- TanStack Virtual (track virtualization)
- Convex (backend + real-time sync)
- Better-auth (authentication, already configured)
- Tailwind + Shadcn/UI
- Bun + Turbo (monorepo)
- Elementary Audio ("@elemaudio/core": "^4.0.1", "@elemaudio/web-renderer": "^4.0.3",)

### Package Structure

```
packages/
  audio/           # Elementary Audio engine
    src/
      index.ts     # Main exports
      engine.ts    # AudioEngine class
      utils.ts     # dB conversion, etc.
    package.json   # deps: @elemaudio/web-renderer, @elemaudio/core

apps/
  web/
    src/
      routes/
        index.tsx          # Dashboard
        project.$id.tsx    # DAW Editor
      components/
        timeline/          # Timeline canvas components
        tracks/            # Track list components
        transport/         # Transport controls
```

### Elementary Audio Architecture

The audio graph structure:

```
Track 1 (gain) ──┐
Track 2 (gain) ──┼──> Sum ──> Master Gain ──> Output
Track 3 (gain) ──┘
```

- Each track: `el.mul(trackSignal, gainValue)` with mute/solo logic
- Master: `el.mul(summedSignal, masterGain)`
- Solo logic: if any track soloed, mute all non-soloed tracks
- In v1, tracks produce silence (no clips yet), but routing must work

### Canvas Performance

- Use `requestAnimationFrame` for playhead animation
- Redraw only changed regions when possible
- Consider offscreen canvas for static elements (grid lines, time markers)

### Convex Real-time

- Use `useQuery` for track list subscription
- Use `useMutation` with optimistic updates for track changes
- Project access control: only owner and collaborators can view/edit

## Success Metrics

- [ ] Can create new project and see it in dashboard
- [ ] Can rename project via settings modal
- [ ] Can add/delete/reorder tracks in project
- [ ] Mute/solo/gain controls update audio engine correctly
- [ ] Playhead moves when clicking timeline
- [ ] Play/stop works, clock updates during playback
- [ ] Keyboard shortcuts work (spacebar, Cmd+T)
- [ ] Multiple browser tabs see track changes in real-time
- [ ] Timeline zoom and scroll work smoothly
- [ ] 50+ tracks render without jank (virtualization working)

## Open Questions

None - all questions resolved during discovery.
