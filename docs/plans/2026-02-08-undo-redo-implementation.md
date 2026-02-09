# Undo/Redo System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add client-side undo/redo for clip and track operations using the command pattern.

**Architecture:** Command pattern with `UndoCommand` interface (`execute`/`undo`). Command factories capture before/after state and call Zero mutators. Undo/redo stacks live in a Zustand store (max 50 entries). Integration at the hook layer wraps existing mutation calls.

**Tech Stack:** Zustand, Zero sync (`@rocicorp/zero`), React, TypeScript

---

### Task 1: Create the UndoCommand type and compoundCommand utility

**Files:**

- Create: `apps/web/src/commands/types.ts`
- Create: `apps/web/src/commands/compoundCommand.ts`

**Step 1: Create `apps/web/src/commands/types.ts`**

```ts
export interface UndoCommand {
  label: string;
  execute: () => Promise<void>;
  undo: () => Promise<void>;
}
```

**Step 2: Create `apps/web/src/commands/compoundCommand.ts`**

```ts
import type { UndoCommand } from "./types";

export function compoundCommand(label: string, commands: UndoCommand[]): UndoCommand {
  return {
    label,
    execute: async () => {
      for (const cmd of commands) await cmd.execute();
    },
    undo: async () => {
      for (const cmd of [...commands].reverse()) await cmd.undo();
    },
  };
}
```

**Step 3: Commit**

```bash
git add apps/web/src/commands/types.ts apps/web/src/commands/compoundCommand.ts
git commit -m "feat(undo): add UndoCommand interface and compoundCommand utility"
```

---

### Task 2: Create the undo store

**Files:**

- Create: `apps/web/src/stores/undoStore.ts`

**Step 1: Create `apps/web/src/stores/undoStore.ts`**

```ts
import { create } from "zustand";
import { toast } from "sonner";
import type { UndoCommand } from "@/commands/types";

const MAX_STACK_SIZE = 50;

interface UndoState {
  undoStack: UndoCommand[];
  redoStack: UndoCommand[];
}

interface UndoActions {
  push: (cmd: UndoCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

type UndoStore = UndoState & UndoActions;

export const useUndoStore = create<UndoStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  push: (cmd) => {
    set((state) => {
      const newStack = [...state.undoStack, cmd];
      if (newStack.length > MAX_STACK_SIZE) {
        newStack.shift();
      }
      return { undoStack: newStack, redoStack: [] };
    });
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const cmd = undoStack[undoStack.length - 1]!;
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
    }));

    try {
      await cmd.undo();
      set((state) => ({
        redoStack: [...state.redoStack, cmd],
      }));
    } catch {
      toast.error("Can't undo — data was modified by another user");
    }
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const cmd = redoStack[redoStack.length - 1]!;
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
    }));

    try {
      await cmd.execute();
      set((state) => ({
        undoStack: [...state.undoStack, cmd],
      }));
    } catch {
      toast.error("Can't redo — data was modified by another user");
    }
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] });
  },

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,
}));
```

**Step 2: Commit**

```bash
git add apps/web/src/stores/undoStore.ts
git commit -m "feat(undo): add undo/redo Zustand store"
```

---

### Task 3: Create clip command factories

**Files:**

- Create: `apps/web/src/commands/clipCommands.ts`

**Context:** All mutations use `z.mutate(mutators.clips.xxx(...))` where `z` is the Zero client. Command factories need the Zero client passed in so they can call mutations. The `useZero()` hook returns the client.

**Step 1: Create `apps/web/src/commands/clipCommands.ts`**

```ts
import type { Zero } from "@rocicorp/zero";
import type { Schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { UndoCommand } from "./types";
import { compoundCommand } from "./compoundCommand";

type Z = Zero<Schema>;

interface ClipPosition {
  trackId: string;
  startTime: number;
}

interface ClipTrimState {
  startTime: number;
  audioStartTime: number;
  duration: number;
}

interface ClipSnapshot {
  id: string;
  projectId: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  gain: number;
}

export function moveClipCommand(
  z: Z,
  clipId: string,
  from: ClipPosition,
  to: ClipPosition,
): UndoCommand {
  return {
    label: "Move Clip",
    execute: async () => {
      const trackChanged = to.trackId !== from.trackId;
      if (trackChanged) {
        await z.mutate(mutators.clips.move({ id: clipId, trackId: to.trackId, startTime: to.startTime }));
      } else {
        await z.mutate(mutators.clips.update({ id: clipId, startTime: to.startTime }));
      }
    },
    undo: async () => {
      const trackChanged = to.trackId !== from.trackId;
      if (trackChanged) {
        await z.mutate(mutators.clips.move({ id: clipId, trackId: from.trackId, startTime: from.startTime }));
      } else {
        await z.mutate(mutators.clips.update({ id: clipId, startTime: from.startTime }));
      }
    },
  };
}

export function trimClipCommand(
  z: Z,
  clipId: string,
  from: ClipTrimState,
  to: ClipTrimState,
): UndoCommand {
  return {
    label: "Trim Clip",
    execute: async () => {
      await z.mutate(mutators.clips.update({
        id: clipId,
        startTime: to.startTime,
        audioStartTime: to.audioStartTime,
        duration: to.duration,
      }));
    },
    undo: async () => {
      await z.mutate(mutators.clips.update({
        id: clipId,
        startTime: from.startTime,
        audioStartTime: from.audioStartTime,
        duration: from.duration,
      }));
    },
  };
}

export function createClipCommand(z: Z, clip: ClipSnapshot): UndoCommand {
  return {
    label: "Create Clip",
    execute: async () => {
      await z.mutate(mutators.clips.create(clip));
    },
    undo: async () => {
      await z.mutate(mutators.clips.delete({ id: clip.id }));
    },
  };
}

export function deleteClipCommand(z: Z, clip: ClipSnapshot): UndoCommand {
  return {
    label: "Delete Clip",
    execute: async () => {
      await z.mutate(mutators.clips.delete({ id: clip.id }));
    },
    undo: async () => {
      await z.mutate(mutators.clips.create(clip));
    },
  };
}

export function deleteClipsCommand(z: Z, clips: ClipSnapshot[]): UndoCommand {
  if (clips.length === 1) return deleteClipCommand(z, clips[0]!);
  return compoundCommand(
    `Delete ${clips.length} Clips`,
    clips.map((clip) => deleteClipCommand(z, clip)),
  );
}

export function splitClipCommand(
  z: Z,
  originalBefore: ClipSnapshot,
  originalAfterDuration: number,
  newClip: ClipSnapshot,
): UndoCommand {
  return compoundCommand("Split Clip", [
    {
      label: "Trim Original",
      execute: async () => {
        await z.mutate(mutators.clips.update({ id: originalBefore.id, duration: originalAfterDuration }));
      },
      undo: async () => {
        await z.mutate(mutators.clips.update({ id: originalBefore.id, duration: originalBefore.duration }));
      },
    },
    createClipCommand(z, newClip),
  ]);
}

export function createClipsCommand(z: Z, clips: ClipSnapshot[]): UndoCommand {
  if (clips.length === 1) return createClipCommand(z, clips[0]!);
  return compoundCommand(
    `Create ${clips.length} Clips`,
    clips.map((clip) => createClipCommand(z, clip)),
  );
}
```

**Step 2: Run type check**

Run: `bun check-types`
Expected: PASS (no type errors in new file)

**Step 3: Commit**

```bash
git add apps/web/src/commands/clipCommands.ts
git commit -m "feat(undo): add clip command factories"
```

---

### Task 4: Create track command factories

**Files:**

- Create: `apps/web/src/commands/trackCommands.ts`

**Context:** Track deletion must capture all clips on the track first. On undo, the track is recreated first, then all clips. The `tracks.delete` mutator (in `packages/zero/src/mutators.ts:144-157`) does NOT cascade-delete clips — clips remain orphaned. So we need to explicitly delete clips when executing and recreate them on undo.

Wait — looking at the mutator more carefully, `tracks.delete` only deletes the track row. Clips with that `trackId` will become orphaned (foreign key not enforced client-side in Zero). The current `TrackDeleteButton.tsx` doesn't delete clips either. So for the undo system, `deleteTrackCommand` should:

- Execute: delete all clips on the track, then delete the track
- Undo: recreate the track, then recreate all clips

**Step 1: Create `apps/web/src/commands/trackCommands.ts`**

```ts
import type { Zero } from "@rocicorp/zero";
import type { Schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { UndoCommand } from "./types";
import { compoundCommand } from "./compoundCommand";

type Z = Zero<Schema>;

interface TrackSnapshot {
  id: string;
  projectId: string;
  name: string;
  order: number;
  color?: string | null;
}

interface ClipSnapshot {
  id: string;
  projectId: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  gain: number;
}

export function createTrackCommand(z: Z, track: TrackSnapshot): UndoCommand {
  return {
    label: "Create Track",
    execute: async () => {
      await z.mutate(mutators.tracks.create({
        id: track.id,
        projectId: track.projectId,
        name: track.name,
        order: track.order,
        ...(track.color != null ? { color: track.color } : {}),
      }));
    },
    undo: async () => {
      await z.mutate(mutators.tracks.delete({ id: track.id }));
    },
  };
}

export function deleteTrackCommand(
  z: Z,
  track: TrackSnapshot,
  clips: ClipSnapshot[],
): UndoCommand {
  const subCommands: UndoCommand[] = [
    // Delete clips first, then track
    ...clips.map((clip): UndoCommand => ({
      label: "Delete Clip",
      execute: async () => {
        await z.mutate(mutators.clips.delete({ id: clip.id }));
      },
      undo: async () => {
        await z.mutate(mutators.clips.create(clip));
      },
    })),
    {
      label: "Delete Track",
      execute: async () => {
        await z.mutate(mutators.tracks.delete({ id: track.id }));
      },
      undo: async () => {
        await z.mutate(mutators.tracks.create({
          id: track.id,
          projectId: track.projectId,
          name: track.name,
          order: track.order,
          ...(track.color != null ? { color: track.color } : {}),
        }));
      },
    },
  ];

  return compoundCommand("Delete Track", subCommands);
  // compound undo runs in reverse: recreate track first, then recreate clips
}

export function reorderTracksCommand(
  z: Z,
  projectId: string,
  beforeTrackIds: string[],
  afterTrackIds: string[],
): UndoCommand {
  return {
    label: "Reorder Tracks",
    execute: async () => {
      await z.mutate(mutators.tracks.reorder({ projectId, trackIds: afterTrackIds }));
    },
    undo: async () => {
      await z.mutate(mutators.tracks.reorder({ projectId, trackIds: beforeTrackIds }));
    },
  };
}
```

**Step 2: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/commands/trackCommands.ts
git commit -m "feat(undo): add track command factories"
```

---

### Task 5: Add keyboard shortcuts for undo/redo

**Files:**

- Modify: `apps/web/src/hooks/useProjectKeyboardShortcuts.ts`
- Modify: `apps/web/src/components/project/ProjectEditor.tsx`

**Step 1: Add `onUndo` and `onRedo` to `KeyboardShortcutActions` interface in `useProjectKeyboardShortcuts.ts`**

In `apps/web/src/hooks/useProjectKeyboardShortcuts.ts`, add two new actions to the `KeyboardShortcutActions` interface (after `onSplitClips`):

```ts
  /** Cmd+Z: undo */
  onUndo: () => void;
  /** Cmd+Shift+Z: redo */
  onRedo: () => void;
```

Destructure them in the hook body (line 36-45):

```ts
  const {
    onTogglePlayStop,
    onAddTrack,
    onClearSelection,
    onSelectAllOnFocusedTrack,
    onDeleteSelectedClips,
    onCopyClips,
    onPasteClips,
    onSplitClips,
    onUndo,
    onRedo,
  } = actions;
```

**Step 2: Add Cmd+Z and Cmd+Shift+Z handlers**

Inside `handleKeyDown` (after the split clips handler at line 98), add:

```ts
      // Undo: Cmd+Z / Ctrl+Z (without Shift)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        onUndo();
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        onRedo();
      }
```

Add `onUndo` and `onRedo` to the `useEffect` dependency array (line 104-113).

**Step 3: Wire up undo/redo in `ProjectEditor.tsx`**

In `apps/web/src/components/project/ProjectEditor.tsx`, import the undo store:

```ts
import { useUndoStore } from "@/stores/undoStore";
```

Inside `ProjectEditor` function body, add:

```ts
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);
```

Pass `onUndo` and `onRedo` to `useProjectKeyboardShortcuts`:

```ts
  useProjectKeyboardShortcuts({
    onTogglePlayStop: togglePlayStop,
    onAddTrack: addTrack,
    onClearSelection: clearClipSelection,
    onSelectAllOnFocusedTrack: handleSelectAllOnFocusedTrack,
    onDeleteSelectedClips: handleDeleteSelectedClips,
    onCopyClips: handleCopyClips,
    onPasteClips: () => handlePasteClips(useAudioStore.getState().playheadTime),
    onSplitClips: () => handleSplitClips(useAudioStore.getState().playheadTime),
    onUndo: undo,
    onRedo: redo,
  });
```

**Step 4: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/hooks/useProjectKeyboardShortcuts.ts apps/web/src/components/project/ProjectEditor.tsx
git commit -m "feat(undo): add Cmd+Z / Cmd+Shift+Z keyboard shortcuts"
```

---

### Task 6: Clear undo stack on project switch

**Files:**

- Modify: `apps/web/src/routes/project.$id.tsx`

**Step 1: Read `apps/web/src/routes/project.$id.tsx` and find the `useEffect` that calls `setProject`/`clearProject`**

The effect is around lines 64-75. It runs when `id` or `project?.sampleRate` change.

**Step 2: Import `useUndoStore` and call `clear()` inside the effect**

Add import:

```ts
import { useUndoStore } from "@/stores/undoStore";
```

Inside the component, get `clear`:

```ts
const clearUndoHistory = useUndoStore((s) => s.clear);
```

In the effect that calls `setProject` (line 70), add `clearUndoHistory()` right before `setProject`:

```ts
  useEffect(() => {
    if (id && project) {
      clearUndoHistory();
      setProject(id, project.sampleRate ?? 44100);
    }
    return () => {
      clearProject();
    };
  }, [id, project?.sampleRate, setProject, clearProject, clearUndoHistory]);
```

**Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/routes/project.\$id.tsx
git commit -m "feat(undo): clear undo stack on project switch"
```

---

### Task 7: Integrate undo for clip move in `useKonvaClipDrag.ts`

**Files:**

- Modify: `apps/web/src/hooks/useKonvaClipDrag.ts`

**Context:** `handleDragEnd` (line 109-211) currently calls `updateClipPosition(...)` for moves and `createClip(...)` for alt-drag duplicates. We need to:

1. For moves: create a `moveClipCommand`, call `cmd.execute()`, push to undo store
2. For alt-drag duplicates: create `createClipCommand` for each duplicated clip, use `compoundCommand` if multiple, push to undo store

The `updateClipPosition` and `createClip` functions are passed in as options — they already call `z.mutate()`. For undo, we need to replace these direct calls with command pattern calls. The cleanest approach: accept a `z` (Zero client) parameter instead, and call mutators directly from the commands.

**However**, looking at the design doc more carefully — the approach is to "wrap mutation calls at the interaction layer." The hooks already receive mutation callbacks. The simplest integration: accept an `onUndoPush` callback and build the commands at this layer.

Actually, the cleanest approach that avoids passing `z` everywhere: add a `pushUndo` callback parameter to each hook, and construct commands inside the hooks using the existing mutation callbacks. But commands need to call the mutations themselves for redo, and the existing mutation callbacks are hoisted from the parent component.

**Simplest approach:** Pass `z` (the Zero client) into the hook so commands can call mutators directly. The commands shouldn't use the wrapper functions — they should call `z.mutate(mutators.clips.xxx(...))` directly.

**Step 1: Add `z` to `UseKonvaClipDragOptions` interface and update the hook**

In `apps/web/src/hooks/useKonvaClipDrag.ts`:

Add imports:

```ts
import type { Zero } from "@rocicorp/zero";
import type { Schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useUndoStore } from "@/stores/undoStore";
import { moveClipCommand, createClipCommand, createClipsCommand } from "@/commands/clipCommands";
```

Remove `updateClipPosition` and `createClip` from the `UseKonvaClipDragOptions` interface. Add `z`:

```ts
interface UseKonvaClipDragOptions {
  tracks: { _id: string }[];
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  z: Zero<Schema>;
  selectedClipIds: Set<string>;
  clips: ClipData[];
  projectId: string;
}
```

**Step 2: Update `handleDragEnd` for moves (the `else` branch, line 185-196)**

Replace the move logic:

```ts
      } else {
        try {
          const trackChanged = state.currentTrackId !== state.originalTrackId;
          const cmd = moveClipCommand(
            z,
            clipId,
            { trackId: state.originalTrackId, startTime: state.originalStartTime },
            { trackId: state.currentTrackId, startTime: state.currentStartTime },
          );
          await cmd.execute();
          useUndoStore.getState().push(cmd);
        } catch {
          toast.error("Failed to move clip");
        }
      }
```

**Step 3: Update `handleDragEnd` for alt-drag duplicates (the `if (state.isDuplicating)` branch, line 125-184)**

Replace the duplication loop. Generate IDs upfront and build clip snapshots, then use `createClipsCommand`:

```ts
      if (state.isDuplicating) {
        // Reset Konva node to original position (unchanged)
        const node = e.target;
        const originalStartSeconds = state.originalStartTime / sampleRate;
        const viewStartTime = scrollLeft / pixelsPerSecond;
        const originalX = (originalStartSeconds - viewStartTime) * pixelsPerSecond;
        const originalTrackIndex = tracks.findIndex((t) => t._id === state.originalTrackId);
        const originalY = RULER_HEIGHT + originalTrackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING;
        node.position({ x: originalX, y: originalY });

        const timeOffset = state.currentStartTime - state.originalStartTime;
        const targetTrackId = state.currentTrackId;

        const clipsToDuplicate = selectedClipIds.has(clipId)
          ? clips.filter((c) => selectedClipIds.has(c._id))
          : clips.filter((c) => c._id === clipId);

        try {
          const clipSnapshots = clipsToDuplicate.map((clip) => {
            let newStartTime: number;
            let newTrackId: string;

            if (clip._id === clipId) {
              newStartTime = state.currentStartTime;
              newTrackId = targetTrackId;
            } else {
              newStartTime = clip.startTime + timeOffset;
              const draggedOriginalTrackIndex = tracks.findIndex(
                (t) => t._id === state.originalTrackId,
              );
              const targetTrackIndex = tracks.findIndex((t) => t._id === targetTrackId);
              const trackOffset = targetTrackIndex - draggedOriginalTrackIndex;
              const clipTrackIndex = tracks.findIndex((t) => t._id === clip.trackId);
              const newTrackIndex = Math.max(
                0,
                Math.min(tracks.length - 1, clipTrackIndex + trackOffset),
              );
              newTrackId = tracks[newTrackIndex]?._id ?? clip.trackId;
            }

            return {
              id: crypto.randomUUID(),
              projectId,
              trackId: newTrackId,
              audioFileId: clip.audioFileId,
              name: clip.name,
              startTime: Math.max(0, newStartTime),
              duration: clip.duration,
              audioStartTime: clip.audioStartTime,
              gain: 0,
            };
          });

          const cmd = createClipsCommand(z, clipSnapshots);
          await cmd.execute();
          useUndoStore.getState().push(cmd);
        } catch {
          toast.error("Failed to duplicate clip");
        }
```

**Step 4: Remove `updateClipPosition` and `createClip` from the dependency array and destructuring**

Update the destructuring to remove `updateClipPosition` and `createClip`, add `z`. Update the dependency array of `handleDragEnd` accordingly.

**Step 5: Update `TimelineCanvasKonva.tsx` to pass `z` instead of `updateClipPosition`/`createClip`**

In `apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx`:

Remove the `updateClipPosition` callback (lines 87-107) and the `createClip` callback (lines 117-132).

Update the `useKonvaClipDrag` call (lines 135-146):

```ts
  const { clipDragState, handleDragStart, handleDragMove, handleDragEnd } = useKonvaClipDrag({
    tracks,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    sampleRate,
    z,
    selectedClipIds,
    clips,
    projectId,
  });
```

**Step 6: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/web/src/hooks/useKonvaClipDrag.ts apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx
git commit -m "feat(undo): integrate undo for clip move and alt-drag duplicate"
```

---

### Task 8: Integrate undo for clip trim in `useKonvaClipTrim.ts`

**Files:**

- Modify: `apps/web/src/hooks/useKonvaClipTrim.ts`
- Modify: `apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx`

**Step 1: Update `useKonvaClipTrim.ts`**

Add imports:

```ts
import type { Zero } from "@rocicorp/zero";
import type { Schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useUndoStore } from "@/stores/undoStore";
import { trimClipCommand } from "@/commands/clipCommands";
```

Replace `trimClip` callback in `UseKonvaClipTrimOptions` with `z`:

```ts
interface UseKonvaClipTrimOptions {
  pixelsPerSecond: number;
  sampleRate: number;
  z: Zero<Schema>;
  getAudioFileDuration?: (audioFileId: string) => number | undefined;
}
```

Update `handleTrimEnd` (line 109-140). Replace the `trimClip` call with a command:

```ts
  const handleTrimEnd = useCallback(
    async (clipId: string) => {
      justFinishedTrimRef.current = true;
      setTimeout(() => {
        justFinishedTrimRef.current = false;
      }, 50);

      const state = trimState;
      if (!state || state.clipId !== clipId) {
        setTrimState(null);
        return;
      }

      setTrimState(null);

      try {
        const deltaSamples = state.currentStartTime - state.originalStartTime;
        const finalAudioStartTime = Math.max(0, state.originalAudioStartTime + deltaSamples);

        const cmd = trimClipCommand(
          z,
          clipId,
          {
            startTime: state.originalStartTime,
            audioStartTime: state.originalAudioStartTime,
            duration: state.originalDuration,
          },
          {
            startTime: state.currentStartTime,
            audioStartTime: finalAudioStartTime,
            duration: state.currentDuration,
          },
        );
        await cmd.execute();
        useUndoStore.getState().push(cmd);
      } catch {
        toast.error("Failed to trim clip");
      }
    },
    [trimState, z],
  );
```

**Step 2: Update `TimelineCanvasKonva.tsx`**

Remove the `trimClip` callback (lines 109-114).

Update the `useKonvaClipTrim` call (lines 149-154):

```ts
  const { trimState, handleTrimStart, handleTrimMove, handleTrimEnd } = useKonvaClipTrim({
    pixelsPerSecond,
    sampleRate,
    z,
    getAudioFileDuration,
  });
```

**Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/hooks/useKonvaClipTrim.ts apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx
git commit -m "feat(undo): integrate undo for clip trim"
```

---

### Task 9: Integrate undo for delete, paste, and split in `useProjectClips.ts`

**Files:**

- Modify: `apps/web/src/hooks/project/useProjectClips.ts`

**Step 1: Add imports**

```ts
import { useUndoStore } from "@/stores/undoStore";
import { deleteClipsCommand, createClipsCommand, splitClipCommand } from "@/commands/clipCommands";
import { compoundCommand } from "@/commands/compoundCommand";
```

Get Zero client and add undo store access:

```ts
  const z = useZero(); // already exists
  const pushUndo = useUndoStore((s) => s.push);
```

**Step 2: Update `handleDeleteSelectedClips` (lines 102-115)**

Replace with:

```ts
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0) return;

    // Snapshot full clip data before deletion (for undo)
    const clipsToDelete = clips
      .filter((clip) => selectedClipIds.has(clip.id))
      .map((clip) => ({
        id: clip.id,
        projectId: clip.projectId,
        trackId: clip.trackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain ?? 0,
      }));

    clearClipSelection();

    const cmd = deleteClipsCommand(z, clipsToDelete);
    await cmd.execute();
    pushUndo(cmd);
  }, [selectedClipIds, clips, clearClipSelection, z, pushUndo]);
```

**Step 3: Update `handlePasteClips` (lines 67-99)**

Replace with:

```ts
  const handlePasteClips = useCallback(
    async (playheadTime: number) => {
      if (!hasClips() || !projectId) return;

      const clipboardData = getClipboardData();
      if (!clipboardData || clipboardData.clips.length === 0) return;

      const targetTrackId = clipboardData.sourceTrackId;
      const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

      const clipSnapshots = clipboardData.clips.map((clip) => ({
        id: crypto.randomUUID(),
        projectId,
        trackId: targetTrackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: playheadTimeInSamples + clip.offsetFromFirst,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
      }));

      const cmd = createClipsCommand(z, clipSnapshots);
      await cmd.execute();
      pushUndo(cmd);
    },
    [hasClips, getClipboardData, sampleRate, z, projectId, pushUndo],
  );
```

**Step 4: Update `handleSplitClips` (lines 118-172)**

Replace with:

```ts
  const handleSplitClips = useCallback(
    async (playheadTime: number) => {
      if (selectedClipIds.size === 0 || clips.length === 0 || !projectId) return;

      const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

      const clipsToSplit = clips.filter((clip) => {
        if (!selectedClipIds.has(clip.id)) return false;
        const clipEnd = clip.startTime + clip.duration;
        return playheadTimeInSamples > clip.startTime && playheadTimeInSamples < clipEnd;
      });

      if (clipsToSplit.length === 0) return;

      clearClipSelection();

      const splitCommands = clipsToSplit.map((clip) => {
        const splitPoint = playheadTimeInSamples - clip.startTime;
        const newDuration = splitPoint;
        const secondClipDuration = clip.duration - splitPoint;
        const secondClipAudioStartTime = clip.audioStartTime + splitPoint;

        const originalBefore = {
          id: clip.id,
          projectId: clip.projectId,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: clip.startTime,
          duration: clip.duration,
          audioStartTime: clip.audioStartTime,
          gain: clip.gain ?? 0,
        };

        const newClip = {
          id: crypto.randomUUID(),
          projectId,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: playheadTimeInSamples,
          duration: secondClipDuration,
          audioStartTime: secondClipAudioStartTime,
          gain: clip.gain ?? 0,
        };

        return splitClipCommand(z, originalBefore, newDuration, newClip);
      });

      const cmd = splitCommands.length === 1
        ? splitCommands[0]!
        : compoundCommand(`Split ${splitCommands.length} Clips`, splitCommands);

      await cmd.execute();
      pushUndo(cmd);
    },
    [selectedClipIds, clips, sampleRate, clearClipSelection, z, projectId, pushUndo],
  );
```

**Step 5: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/web/src/hooks/project/useProjectClips.ts
git commit -m "feat(undo): integrate undo for clip delete, paste, and split"
```

---

### Task 10: Integrate undo for file drop clip creation in `useTimelineFileDrop.ts`

**Files:**

- Modify: `apps/web/src/hooks/useTimelineFileDrop.ts`

**Context:** File drop creates an audio file record AND a clip. The design doc says audio file uploads are NOT undoable — undoing a clip creation only deletes the clip, not the uploaded file. So we only wrap the clip creation.

**Step 1: Add imports**

```ts
import { useUndoStore } from "@/stores/undoStore";
import { createClipCommand } from "@/commands/clipCommands";
```

Also import `useZero`:

```ts
import { useZero } from "@rocicorp/zero/react";
```

**Step 2: Inside `useTimelineFileDrop`, get the Zero client and undo push**

After the existing state declarations (line 139), add:

```ts
  const z = useZero();
  const pushUndo = useUndoStore((s) => s.push);
```

**Step 3: Wrap the clip creation in `handleFileDrop` (around line 302)**

The current code at line 302:

```ts
        await createClip({
          projectId,
          trackId,
          audioFileId,
          name: clipName,
          startTime: dropPosition.dropTimeInSamples,
          duration: durationInSamples,
        });
```

Replace with:

```ts
        const clipId = crypto.randomUUID();
        const clipSnapshot = {
          id: clipId,
          projectId,
          trackId,
          audioFileId,
          name: clipName,
          startTime: dropPosition.dropTimeInSamples,
          duration: durationInSamples,
          audioStartTime: 0,
          gain: 0,
        };
        const cmd = createClipCommand(z, clipSnapshot);
        await cmd.execute();
        pushUndo(cmd);
```

Remove the `createClip` from the destructuring of `useZeroClips` (line 143) if no longer used elsewhere in this hook. Actually, check if `createClip` is used elsewhere — it's only used on line 302. So we can remove it from the destructured imports. Keep `useZeroClips` if it still provides other things — it does not (only `createClip` is used). If `useZeroClips` import is no longer needed, remove it.

Wait — `useZeroClips` is imported on line 14 and used on line 143. We still need the hook for nothing after this change. Actually, looking again, `useZeroAudioFiles` is still needed (line 142). `useZeroClips` can be removed entirely if `createClip` is its only usage here.

Remove:

```ts
import { useZeroClips } from "./useZeroClips";
```

and

```ts
const { createClip } = useZeroClips(projectId);
```

And remove `createClip` from the `handleFileDrop` dependency array (line 359). Add `z` and `pushUndo` to the dependency array.

**Step 4: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/hooks/useTimelineFileDrop.ts
git commit -m "feat(undo): integrate undo for file drop clip creation"
```

---

### Task 11: Integrate undo for track create in `useProjectTracks.ts`

**Files:**

- Modify: `apps/web/src/hooks/project/useProjectTracks.ts`

**Step 1: Add imports**

```ts
import { useUndoStore } from "@/stores/undoStore";
import { createTrackCommand } from "@/commands/trackCommands";
```

**Step 2: Update `addTrack` (lines 29-40)**

```ts
  const pushUndo = useUndoStore((s) => s.push);

  const addTrack = useCallback(async () => {
    if (!projectId) return;
    const trackCount = tracks.length;
    const trackId = crypto.randomUUID();
    const trackData = {
      id: trackId,
      projectId,
      name: `Track ${trackCount + 1}`,
      order: trackCount,
    };
    const cmd = createTrackCommand(z, trackData);
    await cmd.execute();
    pushUndo(cmd);
  }, [z, projectId, tracks.length, pushUndo]);
```

**Step 3: Update `reorderTracks` (lines 42-48)**

```ts
  const reorderTracks = useCallback(
    async (newTrackIds: string[]) => {
      if (!projectId) return;
      const cmd = reorderTracksCommand(z, projectId, trackIds, newTrackIds);
      await cmd.execute();
      pushUndo(cmd);
    },
    [z, projectId, trackIds, pushUndo],
  );
```

Add import for `reorderTracksCommand`:

```ts
import { createTrackCommand, reorderTracksCommand } from "@/commands/trackCommands";
```

**Step 4: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/hooks/project/useProjectTracks.ts
git commit -m "feat(undo): integrate undo for track create and reorder"
```

---

### Task 12: Integrate undo for track delete in `TrackDeleteButton.tsx`

**Files:**

- Modify: `apps/web/src/components/track/TrackDeleteButton.tsx`

**Context:** Track deletion needs to snapshot the track data AND all clips on that track. The `TrackDeleteButton` currently only has `trackId`. It needs access to the track data and clips on that track.

**Step 1: Update the component props and logic**

```ts
import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useZero } from "@rocicorp/zero/react";

import { Button } from "@/components/ui/button";
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";
import { useUndoStore } from "@/stores/undoStore";
import { deleteTrackCommand } from "@/commands/trackCommands";
import { useProjectData } from "@/hooks/project/useProjectData";

interface TrackDeleteButtonProps {
  trackId: string;
  trackName: string;
  trackOrder: number;
  trackColor?: string | null;
  projectId: string;
}

export function TrackDeleteButton({ trackId, trackName, trackOrder, trackColor, projectId }: TrackDeleteButtonProps) {
  const z = useZero();
  const pushUndo = useUndoStore((s) => s.push);
  const { clips } = useProjectData();

  const handleDelete = useCallback(async () => {
    cancelUploadsForTrack(trackId);

    // Snapshot track and its clips for undo
    const trackSnapshot = {
      id: trackId,
      projectId,
      name: trackName,
      order: trackOrder,
      color: trackColor,
    };

    const trackClips = clips
      .filter((c) => c.trackId === trackId)
      .map((c) => ({
        id: c.id,
        projectId: c.projectId,
        trackId: c.trackId,
        audioFileId: c.audioFileId,
        name: c.name,
        startTime: c.startTime,
        duration: c.duration,
        audioStartTime: c.audioStartTime,
        gain: c.gain ?? 0,
      }));

    const cmd = deleteTrackCommand(z, trackSnapshot, trackClips);
    await cmd.execute();
    pushUndo(cmd);
  }, [z, trackId, projectId, trackName, trackOrder, trackColor, clips, pushUndo]);

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground hover:text-destructive"
      onClick={handleDelete}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
```

**Step 2: Update all call sites of `TrackDeleteButton` to pass the new props**

Find where `TrackDeleteButton` is used:

```bash
grep -rn "TrackDeleteButton" apps/web/src/ --include="*.tsx"
```

There will be a parent component (likely in the track list) that renders `<TrackDeleteButton trackId={...} />`. Update it to also pass `trackName`, `trackOrder`, `trackColor`, and `projectId`.

Search for the parent: it's likely `TrackListItem.tsx` or similar. Read the file, find the `<TrackDeleteButton>` usage, and add the missing props from the track data that's already available in that component.

**Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/track/TrackDeleteButton.tsx apps/web/src/components/track/TrackListItem.tsx  # or wherever the parent is
git commit -m "feat(undo): integrate undo for track delete"
```

---

### Task 13: Run `bun check` and fix any lint/format issues

**Step 1: Run lint and format check**

Run: `bun check`

**Step 2: Fix any issues reported**

Apply `oxfmt` formatting and fix `oxlint` warnings as needed.

**Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "style: fix lint and formatting for undo/redo"
```

---

### Task 14: Manual smoke test

**No code changes.** Verify the following in the browser:

1. **Cmd+Z / Cmd+Shift+Z** shortcuts are active
2. **Clip move**: drag a clip, press Cmd+Z — clip returns to original position
3. **Clip trim**: trim a clip edge, press Cmd+Z — clip restores original bounds
4. **Clip delete**: select and delete a clip, press Cmd+Z — clip reappears
5. **Clip paste**: paste clips, press Cmd+Z — pasted clips are removed
6. **Clip split**: split a clip, press Cmd+Z — clip merges back
7. **Alt+drag duplicate**: duplicate clips, press Cmd+Z — duplicates are removed
8. **File drop**: drop an audio file, press Cmd+Z — clip is removed (audio file remains)
9. **Track create**: add a track, press Cmd+Z — track is removed
10. **Track delete**: delete a track with clips, press Cmd+Z — track and clips reappear
11. **Track reorder**: reorder tracks, press Cmd+Z — tracks return to original order
12. **Redo**: after any undo, press Cmd+Shift+Z — action is reapplied
13. **Redo cleared on new action**: undo, then perform a new action — Cmd+Shift+Z does nothing
14. **Project switch**: switch projects — undo stack is cleared
