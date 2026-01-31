# Waveform Visualization Design

## Overview

Add waveform visualization for audio clips in the timeline. When users drag and drop audio files, the system generates a multi-resolution waveform representation that displays within clips at any zoom level.

## Goals

- Visual reference while editing (see transients, silence, audio content for precise trimming/positioning)
- Quick content identification (distinguish clips without playing them)
- Professional look and feel matching commercial DAWs

## Data Model

### New `audioFiles` table

Represents a source audio file with its waveform. Multiple clips can reference the same audio file.

```typescript
audioFiles: defineTable({
  projectId: v.id("projects"),
  storageId: v.id("_storage"),                      // Original audio file
  waveformStorageId: v.optional(v.id("_storage")),  // Waveform data (null while processing)
  name: v.string(),                                  // Original filename
  duration: v.number(),                              // Duration in samples
  sampleRate: v.number(),
  channels: v.number(),                              // 1 = mono, 2 = stereo
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_storage", ["storageId"])
```

### Updated `clips` table

Replace direct storage reference with audio file reference.

```typescript
// Remove:
fileId: v.id("_storage"),
audioDuration: v.number(),

// Add:
audioFileId: v.id("audioFiles"),
```

The `audioDuration` field moves to `audioFiles.duration` since it's a property of the source audio, not the clip.

## Waveform Data Format

Stored as a binary file in Convex storage. Multi-resolution mipmaps for efficient rendering at any zoom level.

### Structure

```typescript
interface WaveformData {
  version: 1;
  sampleRate: number;
  channels: number;              // Stored for reference (1 or 2)
  totalSamples: number;
  levels: WaveformLevel[];
}

interface WaveformLevel {
  samplesPerBucket: number;
  buckets: [number, number][];   // [min, max] pairs, normalized -1..1
}
```

### Mipmap Levels

| Level | Samples/Bucket | ~Size per minute | Use case |
|-------|----------------|------------------|----------|
| 0 | 256 | 31KB | Zoomed in (detail) |
| 1 | 1024 | 8KB | Medium zoom |
| 2 | 4096 | 2KB | Zoomed out |
| 3 | 16384 | 0.5KB | Full project view |

Total: ~40KB per minute of audio.

### Binary Encoding

- Header: version (u8), sampleRate (u32), channels (u8), totalSamples (u32), levelCount (u8)
- Per level: samplesPerBucket (u32), bucketCount (u32), data (Float32Array of min/max pairs)

### Stereo Handling

For stereo files, merge L+R channels: `max(abs(L), abs(R))` per sample bucket. This produces a single waveform that represents both channels.

## Waveform Generation Pipeline

### Flow

```
1. Client uploads audio file → storageId
2. Client calls createAudioFile mutation
   → Creates audioFiles record with waveformStorageId: undefined
   → Schedules generateWaveform action
3. Action runs async (Node.js "use node"):
   → Fetches audio file from storage URL
   → Decodes audio using Node.js audio library
   → Generates 4 mipmap levels
   → Encodes as binary
   → Uploads to Convex storage → waveformStorageId
   → Updates audioFiles record with waveformStorageId
4. Client sees waveformStorageId appear (real-time sync)
   → Fetches and renders waveform
```

### Key Points

- Clip creation happens immediately - user doesn't wait for waveform
- Waveform generation is async via Convex action with "use node"
- Library TBD during implementation (node-web-audio-api, audiowaveform, or ffmpeg-based)

## Client-Side Rendering

### Data Flow

1. New query: `getProjectWaveformUrls({ projectId })` returns `{ [audioFileId]: waveformUrl | null }`
2. Client fetches waveform binary files in parallel
3. Parse and cache in memory, keyed by `audioFileId`
4. Multiple clips sharing same audioFile use cached waveform

### Mipmap Level Selection

```typescript
const samplesPerPixel = sampleRate / pixelsPerSecond;
const level = levels.find(l => l.samplesPerBucket <= samplesPerPixel)
           ?? levels[levels.length - 1];
```

### Canvas Rendering

Extend `drawClips()` in `canvasRenderer.ts`:

1. Get audioFileId from clip
2. Look up cached waveform data
3. If not loaded: draw colored rectangle (current behavior)
4. If loaded:
   - Calculate visible sample range (clip's audioStartTime + viewport)
   - Pick appropriate mipmap level
   - Draw min/max bars from center line, scaled to clip height
   - Apply track color with transparency

### Visual Style

- Waveform fills ~80% of clip height (leaving padding)
- Track color with ~60% opacity for waveform fill
- Classic mirrored display (positive up, negative down from center)
- Existing clip border, selection glow, trim handles render on top

## Loading States

| State | Visual |
|-------|--------|
| Waveform generating | Colored rectangle with subtle shimmer/pulse |
| Waveform loading (fetching) | Colored rectangle with subtle shimmer |
| Waveform loaded | Full waveform display |
| Waveform failed | Colored rectangle (silent fallback) |

## Edge Cases

- **Very short clips** (<1000 samples): Use finest mipmap level
- **Very long files** (>1 hour): Generation takes longer, but async
- **Corrupt audio file**: Generation fails silently, clip works for playback
- **Split/paste clips**: Automatically share waveform via shared audioFileId

## File Changes

### New Files

- `packages/backend/convex/audioFiles.ts` - Table operations, waveform generation action
- `apps/web/src/lib/waveformCache.ts` - Client-side fetch, parse, cache
- `apps/web/src/lib/waveformRenderer.ts` - Canvas drawing functions

### Modified Files

- `packages/backend/convex/schema.ts` - Add audioFiles table, update clips
- `packages/backend/convex/clips.ts` - Reference audioFileId instead of fileId
- `apps/web/src/hooks/useTimelineFileDrop.ts` - Create audioFile first, then clip
- `apps/web/src/lib/canvasRenderer.ts` - Integrate waveform drawing
- `apps/web/src/routes/project.$id.tsx` - Add waveform query, pass to renderer
- `apps/web/src/lib/clipOptimisticUpdates.ts` - Update for new clip structure

## Implementation Order

1. Schema changes + audioFiles table and mutations
2. Update clip creation flow to use audioFiles
3. Waveform generation action (Node.js)
4. Waveform query + client fetch/cache
5. Canvas rendering integration
