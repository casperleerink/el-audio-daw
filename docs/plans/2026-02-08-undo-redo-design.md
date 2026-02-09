# Undo/Redo System Design

## Overview

Client-side undo/redo for clip and track operations using the command pattern, stored in a Zustand store.

## Scope

### Undoable actions

**Clip operations:**

- Move (position and/or track change)
- Trim (left/right edge)
- Delete (single and multi-select)
- Create (file drop, paste, duplicate)
- Split (compound: update original + create new)
- Duplicate via Alt+drag (compound: N creates)

**Track operations:**

- Create
- Delete (captures track + all its clips)
- Reorder

### Not undoable (v1)

- Gain, pan, mute, solo changes
- Effect parameter changes
- Audio file uploads
- Project-level settings

## Architecture

### Command interface

```ts
interface UndoCommand {
  label: string
  execute: () => Promise<void>
  undo: () => Promise<void>
}
```

Compound commands group sub-commands for multi-step operations (split, paste, multi-delete). Undo runs sub-commands in reverse order.

```ts
function compoundCommand(label: string, commands: UndoCommand[]): UndoCommand {
  return {
    label,
    execute: async () => {
      for (const cmd of commands) await cmd.execute()
    },
    undo: async () => {
      for (const cmd of [...commands].reverse()) await cmd.undo()
    },
  }
}
```

### Undo store

New Zustand store at `apps/web/src/stores/undoStore.ts`:

```ts
{
  undoStack: UndoCommand[]   // past actions, most recent on top
  redoStack: UndoCommand[]   // undone actions
  push(cmd)                  // add command, clear redo stack
  undo()                     // pop undo → run .undo() → push to redo
  redo()                     // pop redo → run .execute() → push to undo
  clear()                    // reset both stacks
}
```

- Stack limit: 50 entries (drop oldest when exceeded)
- Redo stack clears on any new push
- Clear on project switch

### Command factories

Located in `apps/web/src/commands/`. Each factory captures before-state and returns a command.

**Clip commands:**

- `moveClipCommand(clipId, from: {trackId, startTime}, to: {trackId, startTime})` — undo moves back to `from`
- `trimClipCommand(clipId, from: {startTime, audioStartTime, duration}, to: {...})` — undo updates to `from` values
- `deleteClipsCommand(clips: ClipData[])` — captures full clip data. Undo recreates all clips. Compound when multiple.
- `createClipCommand(clipId, clipData)` — undo deletes the clip
- `splitClipCommand(originalBefore, originalAfter, newClip)` — compound: undo deletes new clip, restores original

**Track commands:**

- `createTrackCommand(trackId, trackData)` — undo deletes the track
- `deleteTrackCommand(trackData, clips[])` — captures track + all clips. Undo recreates track first, then clips.
- `reorderTracksCommand(before: order[], after: order[])` — undo reapplies `before` ordering

## Integration

### Hook wrapping

Wrap mutation calls at the interaction layer (drag handlers, keyboard handlers). Existing hooks remain unchanged.

```ts
// Example: onDragEnd in useKonvaClipDrag.ts
const cmd = moveClipCommand(clipId, oldPos, newPos)
await cmd.execute()
undoStore.push(cmd)
```

**Files to modify:**

- `useKonvaClipDrag.ts` — clip move + alt-duplicate
- `useKonvaClipTrim.ts` — clip trim
- `useProjectClips.ts` — delete, paste, split
- `useProjectTracks.ts` — create track, delete track, reorder
- `useTimelineFileDrop.ts` — clip creation from file drop

### Keyboard shortcuts

Add to `useProjectKeyboardShortcuts.ts`:

- `Cmd+Z` / `Ctrl+Z` → `undoStore.undo()`
- `Cmd+Shift+Z` / `Ctrl+Shift+Z` → `undoStore.redo()`

### Project switch

Call `undoStore.clear()` when `projectId` changes.

## Edge cases

**Track deletion with clips** — `deleteTrackCommand` snapshots all clips before deleting. On undo, recreates the track first, then all its clips.

**Stale undo after collaborator edits** — If a collaborator modifies or deletes an entity in the undo stack, `undo()` catches the error and shows a toast ("Can't undo — data was modified by another user") instead of crashing.

**ID preservation** — Undoing a delete recreates with the original UUID. Since the row was deleted, re-inserting with the same ID works.

**Stack limit** — Capped at 50 entries. Oldest dropped when exceeded.

**Audio file uploads** — Not undone. Undoing a clip creation deletes the clip but leaves the uploaded file in storage.

**Rapid actions** — No debouncing needed since all undoable actions are discrete (drag end, key press), not continuous.

## File structure

```
apps/web/src/
  stores/undoStore.ts          # Undo/redo stack store
  commands/
    clipCommands.ts            # Clip command factories
    trackCommands.ts           # Track command factories
    compoundCommand.ts         # Compound command utility
    types.ts                   # UndoCommand interface
```
