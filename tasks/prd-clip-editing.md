# PRD: Clip Editing Features

## Overview

Add core clip editing capabilities to the DAW: selection, deletion, trimming, copy/paste, cross-track movement, and splitting. These features enable standard DAW workflow for arranging audio clips on the timeline.

## Goals

- Enable efficient clip arrangement without mouse-only workflows
- Support multi-clip operations for batch editing
- Maintain optimistic update patterns for responsive UI
- Keep selection scoped to single track for simplicity

---

## Tasks

- [x] Implement clip selection state (single click, shift+click multi-select)
- [x] Add visual selection indicator on canvas
- [x] Implement deselect (click empty area, Escape key)
- [x] Add Cmd+A to select all clips on focused track
- [x] Add focused track visual indicator (left border accent on track header)
- [ ] Implement Delete/Backspace to delete selected clips
- [ ] Add trim handles to clip edges (8px grab zone)
- [ ] Implement trim drag logic constrained to audio boundaries
- [ ] Update backend for trim mutations (audioStartTime, duration)
- [ ] Implement Cmd+C to copy selected clips to clipboard
- [ ] Implement Cmd+V to paste clips at playhead position
- [ ] Enable vertical drag to move clips between tracks
- [ ] Add track snap behavior during cross-track drag
- [ ] Implement Cmd+E to split clips at playhead
- [ ] Add backend mutation for split operation

---

## Functional Requirements

### Selection

**FR-1:** Click on clip selects it and deselects all others

**FR-2:** Shift+click on clip adds/removes it from selection

**FR-3:** Selection limited to clips on a single track. Shift+clicking clip on different track clears previous selection and selects new clip

**FR-4:** Cmd+A selects all clips on the currently focused track (track containing most recent selection or click)

**FR-5:** Click on empty timeline area deselects all clips

**FR-6:** Escape key deselects all clips

**FR-7:** Selected clips display visual highlight (distinct border color or fill)

**FR-8:** Pending clips (temp IDs) cannot be selected

**FR-9:** Focused track (most recent selection/click) displays visual indicator - 2-3px accent border on left edge of track header

### Deletion

**FR-10:** Delete or Backspace key deletes all selected clips

**FR-11:** Deletion uses optimistic updates - clips removed from UI immediately

**FR-12:** If deletion fails, clips restored to UI with error indication

**FR-13:** Associated audio files cleaned up from storage (existing backend behavior)

### Trimming

**FR-14:** Clips display trim handles when hovered - 8px wide zones on left and right edges

**FR-15:** Cursor changes to `ew-resize` when hovering trim handles

**FR-16:** Dragging left handle adjusts `startTime` and `audioStartTime` together, keeping audio aligned

**FR-17:** Dragging right handle adjusts `duration` only

**FR-18:** Left trim constrained: `audioStartTime >= 0` (cannot trim before audio start)

**FR-19:** Right trim constrained: `audioStartTime + duration <= originalAudioDuration` (cannot extend beyond audio end)

**FR-20:** No minimum duration - clips can be trimmed to any length > 0

**FR-21:** Trim operations use optimistic updates

**FR-22:** Visual feedback during trim drag (ghost outline showing new bounds)

### Copy/Paste

**FR-23:** Cmd+C copies selected clips to internal clipboard (not system clipboard)

**FR-24:** Clipboard stores clip data: fileId, duration, audioStartTime, gain, relative positions

**FR-25:** Cmd+V pastes clipboard contents at current playhead position

**FR-26:** First clip in paste aligns to playhead; other clips maintain relative offsets

**FR-27:** Pasted clips go to same track as source clips

**FR-28:** Paste creates new clip records (new IDs, reuses same fileId - no storage duplication)

**FR-29:** Paste uses optimistic updates with pending state

**FR-30:** If no clips in clipboard, Cmd+V does nothing (no error)

### Cross-Track Movement

**FR-31:** Dragging clip vertically moves it between tracks

**FR-32:** During drag, clip snaps to track lanes (no free-floating between tracks)

**FR-33:** Visual feedback shows target track highlight during drag

**FR-34:** Multi-clip drag moves all selected clips, preserving horizontal offsets

**FR-35:** Cross-track drag updates `trackId` on commit

**FR-36:** Horizontal movement still works during cross-track drag (combined X/Y movement)

**FR-37:** Overlap handling applies on target track (existing logic)

### Split

**FR-38:** Cmd+E splits all selected clips at playhead position

**FR-39:** Split only affects clips that span the playhead (playhead intersects clip duration)

**FR-40:** Split creates two clips from one:

- Left clip: original startTime, duration = playhead - startTime, original audioStartTime
- Right clip: startTime = playhead, duration = original end - playhead, audioStartTime adjusted

**FR-41:** Both clips reference same audio file (fileId)

**FR-42:** Split preserves gain setting on both clips

**FR-43:** Selection state unchanged after split (neither resulting clip is selected)

**FR-44:** If playhead not intersecting any selected clips, Cmd+E does nothing

**FR-45:** Split uses optimistic updates

---

## Non-Goals

- Undo/redo system (separate feature)
- Clip fades or crossfades
- Time stretching or pitch shifting
- Waveform-level editing
- System clipboard integration (audio data too large)
- Multi-track selection (explicitly scoped to single track)
- Snap to grid/quantize (separate feature)
- Clip looping/repeat
- Cross-project copy/paste

---

## Technical Considerations

### State Management

- Selection state stored in React state (not Convex) - local UI concern
- Focused track ID tracked for Cmd+A behavior
- Clipboard stored in React ref or context - persists across renders but not page refresh

### Existing Infrastructure

- `audioStartTime` field already exists in schema (currently always 0)
- `updateClipPosition` mutation handles horizontal movement
- `deleteClip` mutation handles deletion and storage cleanup
- Optimistic update patterns established in `clipOptimisticUpdates.ts`
- Canvas rendering in `canvasRenderer.ts` needs selection visual

### New Backend Mutations Needed

1. `trimClip` - update startTime, audioStartTime, duration with validation
2. `splitClip` - create two clips from one, return both IDs
3. `updateClipTrack` - change trackId (or extend updateClipPosition)
4. `pasteClips` - batch create clips reusing existing fileIds

### Keyboard Event Handling

- Register global keyboard listeners for shortcuts
- Ensure shortcuts don't fire when typing in inputs
- Cmd+E may conflict with browser shortcuts - test across browsers

### Canvas Interaction

- Trim handles need hit detection in existing mouse handling
- Must distinguish: click (select), drag edge (trim), drag body (move)
- Cross-track drag needs Y-axis tracking (currently only X)

---

## Success Metrics

- All selected clips delete when pressing Delete/Backspace
- Clips can be trimmed to any portion of source audio
- Copy/paste creates independent clips at playhead
- Clips can be moved to any track via drag
- Split creates two adjacent clips with no gap or overlap
- All operations feel instant (optimistic updates)
- No audio glitches during or after operations

---

## Decisions

1. **Paste reuses fileId** - no storage duplication, clips are references to same audio
2. **Cross-project copy/paste** - out of scope
3. **Track focus indicator** - 2-3px accent border on left edge of track header
