# PRD: Optimistic Updates for Project Editor

## Overview

Implement optimistic updates using Convex's built-in `optimisticUpdate` API for all mutations in the project editor. Local changes appear instantly while syncing to server in background. On error, rollback silently with toast notification.

## Goals

- Instant UI feedback (<16ms) for all project editor mutations
- Maintain real-time sync with other collaborators via Convex websockets
- Audio engine reacts to optimistic state immediately
- Generic pattern that scales to future features (clip trimming, fades, etc.)

## Non-Goals

- Offline support
- Undo/redo (future consideration)
- Batch/multi-select operations
- Client-side ID generation (use temp IDs with replacement)

## Tasks

- [x] Create optimistic update utilities
  - Helper to generate temp client IDs
  - Helper to wrap mutations with optimistic behavior
  - Toast notification on rollback

- [ ] Implement optimistic updates for track mutations
  - `createTrack` - instant track appears with temp ID
  - `updateTrack` - instant name/mute/solo/gain changes
  - `deleteTrack` - instant removal from list, cancel pending uploads
  - `reorderTracks` - instant order change (commit on drop)

- [ ] Implement optimistic updates for clip mutations
  - `createClip` - show pending clip during upload flow (not draggable until confirmed)
  - `updateClipPosition` - instant position change on drag (commit on drop)
  - `deleteClip` - instant removal

- [ ] Implement commit-based updates for continuous interactions
  - Gain sliders: local state + audio engine update immediately, server on commit
  - Track reorder: local order during drag, server on drop
  - Clip drag: local position during drag, server on drop

- [ ] Implement upload cancellation
  - Track pending uploads per track
  - Cancel uploads when track is deleted
  - Use AbortController for fetch cancellation

- [ ] Implement optimistic update for project
  - `updateProject` - instant name change

- [ ] Update audio engine sync
  - Engine reads from Convex query cache (includes optimistic state)
  - Verify engine reacts to optimistic track gain/mute/solo changes

- [ ] Add pending state UI for clips
  - Visual indicator for clips awaiting server confirmation
  - Handle upload progress → validation → confirmation flow

## Functional Requirements

### FR-1: Optimistic Update Pattern

All project editor mutations use Convex's `optimisticUpdate`:

```typescript
const createTrack = useMutation(api.tracks.create).withOptimisticUpdate(
  (localStore, args) => {
    const current = localStore.getQuery(api.tracks.list, { projectId: args.projectId });
    if (current !== undefined) {
      localStore.setQuery(api.tracks.list, { projectId: args.projectId }, [
        ...current,
        {
          _id: `temp_${crypto.randomUUID()}` as Id<"tracks">,
          _creationTime: Date.now(),
          projectId: args.projectId,
          name: args.name ?? `Track ${current.length + 1}`,
          order: current.length,
          muted: false,
          solo: false,
          gain: 0,
        }
      ]);
    }
  }
);
```

### FR-2: Temporary ID Convention

- Temp IDs prefixed with `temp_` followed by UUID
- Components must handle temp IDs gracefully (e.g., disable certain actions on pending entities)
- When server confirms, Convex cache automatically updates with real ID

### FR-3: Error Handling

On mutation failure:

1. Convex automatically reverts local cache to server state
2. Show toast: "Failed to [action]. Changes reverted."
3. No additional UI changes needed (cache revert handles it)

### FR-4: Clip Upload Flow

1. User drops audio file on track
2. Immediately show pending clip with:
   - Temp ID
   - Estimated position and duration (from file metadata)
   - Visual "uploading" state
3. Upload proceeds: `generateUploadUrl` → upload → `validateUploadedFile`
4. On validation success: `createClip` mutation (clip already visible, just confirming)
5. On validation failure: Remove pending clip, show error toast

### FR-5: Audio Engine Sync

- Audio engine already syncs via `useEffect` watching Convex query data
- Since queries include optimistic state, engine automatically gets optimistic values
- Verify: changing track gain optimistically should immediately affect audio output

### FR-6: Commit-Based Updates for Continuous Interactions

For interactions with continuous feedback (sliders, drag operations), separate local state from server sync:

**Pattern:**

1. Local state updates immediately on every change (for UI/audio feedback)
2. Server mutation fires only on commit (mouseup, drag end, blur)
3. Optimistic update applies at commit time

**Applies to:**

- Gain sliders: local gain updates audio engine in real-time, mutation on mouseup/commit
- Track reordering: local order updates UI during drag, mutation on drop
- Clip position: local position updates UI during drag, mutation on drop

```typescript
// Example: gain slider
const [localGain, setLocalGain] = useState(track.gain);

// Update local + audio engine immediately
const handleGainChange = (value: number) => {
  setLocalGain(value);
  audioEngine.setTrackGain(track._id, value);
};

// Commit to server on release
const handleGainCommit = () => {
  updateTrack({ id: track._id, gain: localGain });
};
```

### FR-7: Upload Cancellation on Track Delete

When a track is deleted while a clip upload is in progress:

1. Cancel any pending uploads targeting that track
2. Abort fetch requests if possible
3. Clean up pending clip from local state
4. No error toast needed (intentional cancellation)

Track upload state in a ref/store keyed by track ID to enable cancellation.

### FR-8: Generic Architecture

Create reusable utilities in `apps/web/src/lib/optimistic.ts`:

```typescript
// Generate temp ID
export function tempId<T extends string>(): Id<T>

// Type for entities that may be pending
export type MaybePending<T> = T & { _pending?: boolean }

// Check if entity is pending
export function isPending(entity: { _id: string }): boolean
```

Optimistic update functions live alongside mutations or in dedicated files per domain (tracks, clips, etc.).

## Design Considerations

### State Flow

```
User Action
    ↓
Optimistic Update (instant, local cache)
    ↓                          ↓
UI Update (instant)    Audio Engine Update (instant)
    ↓
Server Mutation (async)
    ↓
Success: Cache reconciles (usually no visible change)
Failure: Cache reverts + toast
```

### Query Dependencies

Optimistic updates must update all affected queries:

- `createTrack`: Update `tracks.list` query
- `deleteTrack`: Update `tracks.list` query
- `createClip`: Update `clips.list` query AND potentially `projects.get` (duration)
- etc.

### Pending Clip Visual State

Pending clips should have:

- Slightly transparent or desaturated appearance
- Upload progress indicator (if still uploading)
- No context menu actions that require server state

## Success Metrics

- Track/clip operations feel instant (no perceptible delay)
- Audio engine responds to gain/mute/solo changes within same frame
- Error rollbacks don't cause jarring UI jumps
- No duplicate entities appear during sync

## Decisions Made

- Pending clips are NOT draggable until server confirms (simplicity)
- Continuous interactions (gain, reorder, clip drag) use commit-based pattern: local updates immediately, server mutation on commit
- Track deletion cancels any pending uploads to that track

## Open Questions

1. Should we show a loading spinner or skeleton for newly created tracks before server confirms?
2. How to handle rapid sequential creates (e.g., user clicks "Add Track" 5 times quickly)?
