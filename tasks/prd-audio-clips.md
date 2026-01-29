# PRD: Audio Clips

## Overview

Add ability to drag audio files from computer onto tracks, upload to Convex file storage, load into Elementary Audio VFS, and play back on the timeline.

## Goals

- Users can add audio clips to tracks via drag-and-drop
- Clips are stored persistently and synced across sessions
- Audio plays back at correct timeline position with track gain/mute/solo applied
- Clips can be moved along timeline after placement

## Tasks

- [x] Add `clips` table to Convex schema
- [x] Add `color` field to tracks table (or generate deterministically from track order/id)
- [x] Add `duration` field to projects table (in samples)
- [x] Add `sampleRate` field to projects table
- [x] Create Convex file upload mutation
- [x] Create clip CRUD mutations (create, update position, delete)
- [x] Create query to get clips for a project
- [x] Set up Elementary VFS integration in AudioEngine
- [x] Add method to load audio buffer into VFS
- [x] Update audio graph to render clips at correct positions
- [x] Implement drag-drop zone on timeline track lanes
- [x] Calculate drop position in samples from mouse position
- [x] Decode audio file client-side to get duration/sample rate
- [x] Upload file to Convex on drop
- [x] Create clip record after successful upload
- [x] Render clip rectangles on timeline canvas
- [ ] Implement clip dragging to move position
- [ ] Handle clip overlap (truncate existing clip)
- [x] Load all project clips into VFS on page load
- [x] Show loading state during upload
- [x] Show error state on upload failure
- [ ] Auto-extend project duration when clip placed near/past end

## Functional Requirements

### Schema

**FR-1**: Add `clips` table with fields:

- `projectId`: reference to projects table
- `trackId`: reference to tracks table
- `fileId`: Convex storage ID (used as VFS key)
- `name`: string (original filename)
- `startTime`: number (position on timeline in samples)
- `duration`: number (clip length in samples)
- `audioStartTime`: number (offset into source audio in samples, default 0, for future trimming)
- `gain`: number (clip gain in dB, default 0)
- `createdAt`, `updatedAt`: timestamps

**FR-2**: Add index on clips table: `by_track` for trackId, `by_project` for projectId

**FR-2.1**: Tracks need a color for clip rendering. Either add `color` field to tracks table, or generate deterministically from track order (e.g., HSL with hue based on index). Implementation choice.

**FR-3**: Add `duration` field to projects table (number, in samples). Default to 10 seconds worth of samples.

**FR-4**: Add `sampleRate` field to projects table (number, default 44100)

### File Upload

**FR-5**: Support audio formats: WAV, MP3, AIFF, FLAC, OGG (same as Elementary Audio supports)

**FR-6**: Maximum file size: 100MB. Reject larger files with error message.

**FR-7**: Validate file type before upload. Show error for unsupported formats.

**FR-8**: Upload file to Convex file storage, return storage ID

### Clip Creation

**FR-9**: On successful upload, create clip record with:

- `startTime` = mouse drop position converted to samples
- `duration` = decoded audio duration in samples
- `audioStartTime` = 0
- `gain` = 0
- `name` = original filename (without extension)

**FR-10**: Decode audio file client-side using Web Audio API `decodeAudioData` before upload to determine duration and validate format

**FR-11**: If project sampleRate not set, set it to first uploaded clip's sample rate. If clip sample rate differs from project, resample or show warning (implementation choice: show warning for v1).

### Clip Overlap Handling

**FR-12**: When placing a new clip, if it overlaps with existing clip on same track:

- If new clip starts inside existing clip: truncate existing clip's duration to end where new clip starts
- If new clip completely covers existing clip: delete existing clip
- Multiple existing clips can be affected

### Project Duration

**FR-13**: When clip end position (startTime + duration) exceeds project duration, extend project duration to clip end + 10 seconds worth of samples

**FR-14**: Project duration determines timeline length for rendering

### VFS Integration

**FR-15**: AudioEngine must initialize VFS with `core.updateVirtualFileSystem(vfsMap)`

**FR-16**: Each audio file loaded into VFS with key = Convex storage ID string

**FR-17**: Load all project clips into VFS when:

- User opens project page
- New clip is uploaded

**FR-18**: Fetch audio data from Convex storage URL, decode with AudioContext, add to VFS as Float32Array(s)

### Playback

**FR-19**: Use `el.sample()` or `el.sampleseq()` to play clips at correct position based on playhead

**FR-20**: Clip audio signal flow: `clip gain -> track gain -> (mute/solo logic) -> master`

**FR-21**: Multiple clips on same track sum together before track gain

**FR-22**: If track is muted or another track is soloed, clip audio is silenced (use existing mute/solo logic)

**FR-23**: Clips only play during their time range: from `startTime` to `startTime + duration` samples

### UI - Timeline Rendering

**FR-24**: Render clips as colored rectangles on timeline canvas within track lanes. Clip color inherited from track (each track has a consistent color).

**FR-25**: Clip rectangle shows filename (truncated if too long)

**FR-26**: Clip width = duration \* pixelsPerSecond / sampleRate

**FR-27**: Clip x position = startTime \* pixelsPerSecond / sampleRate

**FR-28**: Different visual states:

- Normal: solid color with filename
- Loading: semi-transparent with spinner/pulsing effect
- Error: red-tinted with error icon

### UI - Drag and Drop (Adding Clips)

**FR-29**: Track lane area on timeline is drop zone for audio files

**FR-30**: Show visual feedback when dragging file over valid drop zone (highlight track lane)

**FR-31**: On drop, calculate startTime in samples: `(mouseX + scrollOffset) / pixelsPerSecond * sampleRate`

**FR-32**: Disable clip interaction during upload (show loading state)

**FR-33**: On upload error, show error variant clip and toast notification with error message

### UI - Clip Movement

**FR-34**: Clips can be dragged horizontally to change startTime

**FR-35**: During drag, move actual clip rectangle to new position (with slight opacity reduction to indicate dragging state)

**FR-36**: On drop, update clip's startTime in database

**FR-37**: Moving a clip triggers same overlap handling as placing new clip (FR-12)

**FR-38**: Clips cannot be dragged to negative startTime (clamp to 0)

## Non-Goals

- Waveform visualization (future feature)
- Clip trimming/resizing (future - audioStartTime field prepared for this)
- Multiple file drop at once
- Copy/paste clips
- Undo/redo
- Clip fade in/out
- Audio format conversion/resampling
- Recording audio directly

## Technical Considerations

### Elementary Audio VFS

The VFS is a map of string keys to Float32Array audio buffers. For stereo files, channels are interleaved or provided separately depending on el.sample() usage.

```typescript
// VFS update example
core.updateVirtualFileSystem({
  [storageId]: audioBuffer.getChannelData(0) // mono
})

// Playback with el.sample
el.sample({ path: storageId, mode: 'trigger' }, trigger, rate)
```

### Convex File Storage

Use `ctx.storage.store()` for upload, `ctx.storage.getUrl()` for retrieval. Files are stored with content-type for proper MIME handling.

### Position Calculations

All positions stored in samples for precision. Convert to/from seconds using project sampleRate:

- samples to seconds: `samples / sampleRate`
- seconds to samples: `seconds * sampleRate`

### Existing Patterns

- Follow optimistic update pattern from track controls
- Follow drag-drop pattern from track reordering
- Integrate with existing AudioEngine class

## Success Metrics

- User can drag audio file onto track and see clip appear
- Clip plays at correct position when timeline plays
- Clip respects track mute/solo/gain
- Clip persists after page reload
- Clip can be moved by dragging
- Overlapping clips handled correctly (existing clip truncated)
- Loading and error states display appropriately

## Open Questions

None - all questions resolved.
