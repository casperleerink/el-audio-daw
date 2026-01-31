# Waveform Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display audio waveforms inside clips on the timeline, with multi-resolution mipmaps for smooth rendering at any zoom level.

**Architecture:** Introduce an `audioFiles` table that owns both the audio storage file and its waveform data. Clips reference `audioFiles` instead of storage directly. Waveform generation happens async via a Convex Node.js action after upload. Client fetches binary waveform files and renders them on the canvas.

**Tech Stack:** Convex (backend + storage), Node.js action with audio decoding library, TypeScript, Canvas 2D rendering

---

## Task 1: Add audioFiles Table to Schema

**Files:**

- Modify: `packages/backend/convex/schema.ts`

**Step 1: Add the audioFiles table definition**

Add after the `tracks` table definition (around line 36):

```typescript
audioFiles: defineTable({
  projectId: v.id("projects"),
  storageId: v.id("_storage"), // Original audio file
  waveformStorageId: v.optional(v.id("_storage")), // Waveform data (null while processing)
  name: v.string(), // Original filename
  duration: v.number(), // Duration in samples
  sampleRate: v.number(),
  channels: v.number(), // 1 = mono, 2 = stereo
  createdAt: v.number(),
})
  .index("by_project", ["projectId"])
  .index("by_storage", ["storageId"]),
```

**Step 2: Update clips table to reference audioFiles**

Replace the `fileId` and `audioDuration` fields (lines 41 and 46):

```typescript
clips: defineTable({
  projectId: v.id("projects"),
  trackId: v.id("tracks"),
  audioFileId: v.id("audioFiles"), // Reference to audioFiles table
  name: v.string(), // Original filename
  startTime: v.number(), // Position on timeline in samples
  duration: v.number(), // Clip length in samples (visible/playable portion)
  audioStartTime: v.number(), // Offset into source audio in samples (for trimming)
  gain: v.number(), // Clip gain in dB
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_track", ["trackId"])
  .index("by_project", ["projectId"]),
```

**Step 3: Run type check to verify schema**

Run: `bun check-types`
Expected: May show errors in clips.ts and other files that reference `fileId`/`audioDuration` - this is expected and will be fixed in subsequent tasks.

**Step 4: Commit**

```bash
git add packages/backend/convex/schema.ts
git commit -m "$(cat <<'EOF'
feat(schema): add audioFiles table and update clips reference

- Add audioFiles table with storageId, waveformStorageId, metadata
- Update clips table to use audioFileId instead of fileId
- Remove audioDuration from clips (now in audioFiles.duration)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create audioFiles Backend Module

**Files:**

- Create: `packages/backend/convex/audioFiles.ts`

**Step 1: Create the audioFiles module with basic CRUD**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkQueryAccess, requireProjectAccess } from "./utils";

/**
 * Create an audio file record after upload.
 * This is called after the file is uploaded to storage.
 * Waveform generation is scheduled as a separate action.
 */
export const createAudioFile = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    name: v.string(),
    duration: v.number(), // in samples
    sampleRate: v.number(),
    channels: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const now = Date.now();
    const audioFileId = await ctx.db.insert("audioFiles", {
      projectId: args.projectId,
      storageId: args.storageId,
      waveformStorageId: undefined,
      name: args.name,
      duration: args.duration,
      sampleRate: args.sampleRate,
      channels: args.channels,
      createdAt: now,
    });

    return audioFileId;
  },
});

/**
 * Update an audio file's waveform storage ID.
 * Called by the waveform generation action after processing.
 */
export const updateWaveformStorageId = mutation({
  args: {
    audioFileId: v.id("audioFiles"),
    waveformStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    await requireProjectAccess(ctx, audioFile.projectId);

    await ctx.db.patch(args.audioFileId, {
      waveformStorageId: args.waveformStorageId,
    });
  },
});

/**
 * Get an audio file by ID.
 */
export const getAudioFile = query({
  args: {
    audioFileId: v.id("audioFiles"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return null;
    }

    return await ctx.db.get(args.audioFileId);
  },
});

/**
 * Get all audio files for a project.
 */
export const getProjectAudioFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("audioFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/**
 * Get waveform URLs for all audio files in a project.
 * Returns a map of audioFileId -> waveformUrl (or null if not yet generated).
 */
export const getProjectWaveformUrls = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return {};
    }

    const audioFiles = await ctx.db
      .query("audioFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const result: Record<string, string | null> = {};
    for (const audioFile of audioFiles) {
      if (audioFile.waveformStorageId) {
        result[audioFile._id] = await ctx.storage.getUrl(audioFile.waveformStorageId);
      } else {
        result[audioFile._id] = null;
      }
    }

    return result;
  },
});

/**
 * Delete an audio file and its associated storage files.
 * Only called when no clips reference this audio file.
 */
export const deleteAudioFile = mutation({
  args: {
    audioFileId: v.id("audioFiles"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    if (audioFile.projectId !== args.projectId) {
      throw new Error("Audio file does not belong to this project");
    }

    // Delete storage files
    await ctx.storage.delete(audioFile.storageId);
    if (audioFile.waveformStorageId) {
      await ctx.storage.delete(audioFile.waveformStorageId);
    }

    // Delete the record
    await ctx.db.delete(args.audioFileId);
  },
});
```

**Step 2: Run type check**

Run: `bun check-types`
Expected: Should pass for this new file (other files may still have errors).

**Step 3: Commit**

```bash
git add packages/backend/convex/audioFiles.ts
git commit -m "$(cat <<'EOF'
feat(backend): add audioFiles module with CRUD operations

- createAudioFile: creates record after upload
- updateWaveformStorageId: called after waveform generation
- getProjectAudioFiles: list all audio files for project
- getProjectWaveformUrls: get waveform URLs keyed by audioFileId
- deleteAudioFile: cleanup storage and record

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update clips.ts to Use audioFileId

**Files:**

- Modify: `packages/backend/convex/clips.ts`

**Step 1: Update createClip mutation**

Replace `fileId` arg with `audioFileId` and remove `duration` from audioDuration logic:

```typescript
export const createClip = mutation({
  args: {
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    audioFileId: v.id("audioFiles"), // Changed from fileId
    name: v.string(),
    startTime: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Verify track belongs to project
    const track = await ctx.db.get(args.trackId);
    if (!track || track.projectId !== args.projectId) {
      throw new Error("Track not found in this project");
    }

    // Verify audio file belongs to project
    const audioFile = await ctx.db.get(args.audioFileId);
    if (!audioFile || audioFile.projectId !== args.projectId) {
      throw new Error("Audio file not found in this project");
    }

    // Validate position
    if (args.startTime < 0) {
      throw new Error("Start time cannot be negative");
    }
    if (args.duration <= 0) {
      throw new Error("Duration must be positive");
    }

    const newClipEnd = args.startTime + args.duration;

    // Handle clip overlap (FR-12)
    await handleClipOverlap(ctx.db, args.trackId, args.startTime, newClipEnd);

    // Extend project duration if needed (FR-13)
    await extendProjectDurationIfNeeded(ctx.db, args.projectId, newClipEnd);

    const now = Date.now();
    const clipId = await ctx.db.insert("clips", {
      projectId: args.projectId,
      trackId: args.trackId,
      audioFileId: args.audioFileId, // Changed from fileId
      name: args.name,
      startTime: args.startTime,
      duration: args.duration,
      audioStartTime: 0,
      gain: 0,
      createdAt: now,
      updatedAt: now,
    });

    return clipId;
  },
});
```

**Step 2: Update trimClip mutation**

Remove `audioDuration` reference, get it from audioFiles:

```typescript
export const trimClip = mutation({
  args: {
    id: v.id("clips"),
    startTime: v.number(),
    audioStartTime: v.number(),
    duration: v.number(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Get audio file to check audioDuration
    const audioFile = await ctx.db.get(clip.audioFileId);
    if (!audioFile) {
      throw new Error("Audio file not found");
    }

    // Validate constraints (FR-18, FR-19, FR-20)
    if (args.audioStartTime < 0) {
      throw new Error("Cannot trim before audio start (audioStartTime < 0)");
    }
    if (args.duration <= 0) {
      throw new Error("Duration must be positive");
    }
    if (args.audioStartTime + args.duration > audioFile.duration) {
      throw new Error("Cannot extend beyond audio end");
    }
    if (args.startTime < 0) {
      throw new Error("Start time cannot be negative");
    }

    const newClipEnd = args.startTime + args.duration;

    // Handle clip overlap after trim
    await handleClipOverlap(ctx.db, clip.trackId, args.startTime, newClipEnd, args.id);

    // Extend project duration if needed
    await extendProjectDurationIfNeeded(ctx.db, clip.projectId, newClipEnd);

    await ctx.db.patch(args.id, {
      startTime: args.startTime,
      audioStartTime: args.audioStartTime,
      duration: args.duration,
      updatedAt: Date.now(),
    });
  },
});
```

**Step 3: Update deleteClip mutation**

Remove storage deletion (handled by audioFiles cleanup):

```typescript
export const deleteClip = mutation({
  args: {
    id: v.id("clips"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    // Note: We don't delete the audio file here because other clips may reference it.
    // Audio file cleanup should be handled separately (e.g., when project is deleted
    // or via a cleanup job that finds orphaned audio files).

    // Delete the clip record
    await ctx.db.delete(args.id);
  },
});
```

**Step 4: Update pasteClips mutation**

Change `fileId` to `audioFileId`, remove `audioDuration`:

```typescript
export const pasteClips = mutation({
  args: {
    projectId: v.id("projects"),
    trackId: v.id("tracks"),
    clips: v.array(
      v.object({
        audioFileId: v.id("audioFiles"), // Changed from fileId
        name: v.string(),
        startTime: v.number(),
        duration: v.number(),
        audioStartTime: v.number(),
        gain: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    // Verify track belongs to project
    const track = await ctx.db.get(args.trackId);
    if (!track || track.projectId !== args.projectId) {
      throw new Error("Track not found in this project");
    }

    const createdClipIds: string[] = [];
    const now = Date.now();

    // Sort clips by start time to handle overlaps in order
    const sortedClips = [...args.clips].sort((a, b) => a.startTime - b.startTime);

    for (const clip of sortedClips) {
      // Validate position
      if (clip.startTime < 0) {
        throw new Error("Start time cannot be negative");
      }
      if (clip.duration <= 0) {
        throw new Error("Duration must be positive");
      }

      const clipEnd = clip.startTime + clip.duration;

      // Handle clip overlap (FR-12)
      await handleClipOverlap(ctx.db, args.trackId, clip.startTime, clipEnd);

      // Extend project duration if needed (FR-13)
      await extendProjectDurationIfNeeded(ctx.db, args.projectId, clipEnd);

      const clipId = await ctx.db.insert("clips", {
        projectId: args.projectId,
        trackId: args.trackId,
        audioFileId: clip.audioFileId, // Changed from fileId
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      });

      createdClipIds.push(clipId);
    }

    return createdClipIds;
  },
});
```

**Step 5: Update splitClip mutation**

Change `fileId` to `audioFileId`, remove `audioDuration`:

```typescript
export const splitClip = mutation({
  args: {
    id: v.id("clips"),
    splitTime: v.number(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.id);
    if (!clip) {
      throw new Error("Clip not found");
    }

    await requireProjectAccess(ctx, clip.projectId);

    const clipEnd = clip.startTime + clip.duration;

    // FR-39: Split only if splitTime is within clip bounds
    if (args.splitTime <= clip.startTime || args.splitTime >= clipEnd) {
      throw new Error("Split position must be within the clip boundaries");
    }

    const now = Date.now();

    // FR-40: Calculate left clip properties
    const leftDuration = args.splitTime - clip.startTime;

    // FR-40: Calculate right clip properties
    const rightStartTime = args.splitTime;
    const rightDuration = clipEnd - args.splitTime;
    const rightAudioStartTime = clip.audioStartTime + leftDuration;

    // Update the original clip to become the left clip
    await ctx.db.patch(args.id, {
      duration: leftDuration,
      updatedAt: now,
    });

    // Create the right clip (FR-41: same audioFileId, FR-42: same gain)
    const rightClipId = await ctx.db.insert("clips", {
      projectId: clip.projectId,
      trackId: clip.trackId,
      audioFileId: clip.audioFileId, // Changed from fileId
      name: clip.name,
      startTime: rightStartTime,
      duration: rightDuration,
      audioStartTime: rightAudioStartTime,
      gain: clip.gain,
      createdAt: now,
      updatedAt: now,
    });

    return {
      leftClipId: args.id,
      rightClipId,
    };
  },
});
```

**Step 6: Update getProjectClipUrls query**

Get URLs through audioFiles:

```typescript
export const getProjectClipUrls = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await checkQueryAccess(ctx, args.projectId);
    if (!user) {
      return [];
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Get unique audioFileIds
    const audioFileIds = [...new Set(clips.map((clip) => clip.audioFileId))];

    // Fetch audio files and their URLs
    const audioFileUrls = new Map<string, string | null>();
    for (const audioFileId of audioFileIds) {
      const audioFile = await ctx.db.get(audioFileId);
      if (audioFile) {
        audioFileUrls.set(audioFileId, await ctx.storage.getUrl(audioFile.storageId));
      }
    }

    // Build result keyed by audioFileId (not clipId) to avoid duplication
    const result: Record<string, string | null> = {};
    for (const [audioFileId, url] of audioFileUrls) {
      result[audioFileId] = url;
    }

    return result;
  },
});
```

**Step 7: Run type check**

Run: `bun check-types`
Expected: May show errors in frontend files - will be fixed in later tasks.

**Step 8: Commit**

```bash
git add packages/backend/convex/clips.ts
git commit -m "$(cat <<'EOF'
refactor(clips): use audioFileId instead of fileId

- Update createClip to accept audioFileId, verify audio file exists
- Update trimClip to get audioDuration from audioFiles table
- Update deleteClip to not delete storage (handled by audioFiles)
- Update pasteClips to use audioFileId
- Update splitClip to use audioFileId
- Update getProjectClipUrls to return URLs keyed by audioFileId

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add Waveform Generation Action

**Files:**

- Create: `packages/backend/convex/waveform.ts`

**Step 1: Create waveform types and constants**

```typescript
"use node";

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Mipmap levels: samples per bucket
const MIPMAP_LEVELS = [256, 1024, 4096, 16384];

// Binary format version
const WAVEFORM_VERSION = 1;

interface WaveformLevel {
  samplesPerBucket: number;
  buckets: [number, number][]; // [min, max] pairs
}

interface WaveformData {
  version: number;
  sampleRate: number;
  channels: number;
  totalSamples: number;
  levels: WaveformLevel[];
}
```

**Step 2: Add audio decoding and waveform generation logic**

```typescript
/**
 * Decode audio buffer and generate mipmap levels.
 * For stereo, merges channels: max(abs(L), abs(R))
 */
function generateWaveformData(
  audioData: Float32Array[],
  sampleRate: number,
  totalSamples: number,
): WaveformData {
  const channels = audioData.length;

  // Merge channels if stereo
  const mergedData = new Float32Array(totalSamples);
  if (channels === 1) {
    mergedData.set(audioData[0]);
  } else {
    // Stereo: take max(abs(L), abs(R))
    const left = audioData[0];
    const right = audioData[1];
    for (let i = 0; i < totalSamples; i++) {
      mergedData[i] = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    }
  }

  // Generate mipmap levels
  const levels: WaveformLevel[] = [];
  for (const samplesPerBucket of MIPMAP_LEVELS) {
    const bucketCount = Math.ceil(totalSamples / samplesPerBucket);
    const buckets: [number, number][] = [];

    for (let i = 0; i < bucketCount; i++) {
      const start = i * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, totalSamples);

      let min = 0;
      let max = 0;
      for (let j = start; j < end; j++) {
        const value = mergedData[j];
        // For merged data, value is always positive (we took abs above)
        // Reconstruct min/max as -value to +value for mirrored display
        if (value > max) max = value;
      }
      min = -max; // Mirror for display

      buckets.push([min, max]);
    }

    levels.push({ samplesPerBucket, buckets });
  }

  return {
    version: WAVEFORM_VERSION,
    sampleRate,
    channels,
    totalSamples,
    levels,
  };
}
```

**Step 3: Add binary encoding function**

```typescript
/**
 * Encode waveform data to binary format.
 *
 * Format:
 * - Header: version (u8), sampleRate (u32), channels (u8), totalSamples (u32), levelCount (u8)
 * - Per level: samplesPerBucket (u32), bucketCount (u32), data (Float32Array of min/max pairs)
 */
function encodeWaveformBinary(data: WaveformData): ArrayBuffer {
  // Calculate total size
  let totalSize = 1 + 4 + 1 + 4 + 1; // header
  for (const level of data.levels) {
    totalSize += 4 + 4; // samplesPerBucket + bucketCount
    totalSize += level.buckets.length * 2 * 4; // min/max pairs as float32
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Header
  view.setUint8(offset, data.version);
  offset += 1;
  view.setUint32(offset, data.sampleRate, true);
  offset += 4;
  view.setUint8(offset, data.channels);
  offset += 1;
  view.setUint32(offset, data.totalSamples, true);
  offset += 4;
  view.setUint8(offset, data.levels.length);
  offset += 1;

  // Levels
  for (const level of data.levels) {
    view.setUint32(offset, level.samplesPerBucket, true);
    offset += 4;
    view.setUint32(offset, level.buckets.length, true);
    offset += 4;

    for (const [min, max] of level.buckets) {
      view.setFloat32(offset, min, true);
      offset += 4;
      view.setFloat32(offset, max, true);
      offset += 4;
    }
  }

  return buffer;
}
```

**Step 4: Add the main generation action**

```typescript
/**
 * Generate waveform data for an audio file.
 * Runs as a Node.js action to handle CPU-intensive audio processing.
 */
export const generateWaveform = action({
  args: {
    audioFileId: v.id("audioFiles"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Fetch audio file from storage
    const audioUrl = await ctx.storage.getUrl(args.storageId);
    if (!audioUrl) {
      throw new Error("Audio file not found in storage");
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch audio file");
    }

    const arrayBuffer = await response.arrayBuffer();

    // Decode audio using Web Audio API (available in Node.js via polyfill or native)
    // Note: In Convex actions, we need to use a library that works in Node.js
    // For now, we'll use a simple WAV parser for initial implementation
    // TODO: Add support for more formats via ffmpeg or similar

    const audioData = await decodeAudioBuffer(arrayBuffer);

    // Generate waveform data
    const waveformData = generateWaveformData(
      audioData.channelData,
      audioData.sampleRate,
      audioData.length,
    );

    // Encode to binary
    const binaryData = encodeWaveformBinary(waveformData);

    // Upload to storage
    const waveformStorageId = await ctx.storage.store(new Blob([binaryData]));

    // Update the audio file record
    await ctx.runMutation(internal.waveform.setWaveformStorageId, {
      audioFileId: args.audioFileId,
      waveformStorageId,
    });

    return { success: true, waveformStorageId };
  },
});

/**
 * Internal mutation to set waveform storage ID.
 */
export const setWaveformStorageId = internalMutation({
  args: {
    audioFileId: v.id("audioFiles"),
    waveformStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioFileId, {
      waveformStorageId: args.waveformStorageId,
    });
  },
});

/**
 * Simple audio decoder for common formats.
 * Returns channel data as Float32Arrays.
 */
async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<{
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
}> {
  const view = new DataView(arrayBuffer);

  // Check for WAV format (RIFF header)
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

  if (riff === "RIFF") {
    return decodeWav(arrayBuffer);
  }

  // For other formats, we'd need additional libraries
  // For now, throw an error - can be extended later
  throw new Error("Unsupported audio format. Currently only WAV is supported for waveform generation.");
}

/**
 * Decode WAV file to channel data.
 */
function decodeWav(arrayBuffer: ArrayBuffer): {
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
} {
  const view = new DataView(arrayBuffer);
  let offset = 12; // Skip RIFF header

  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let dataStart = 0;
  let dataLength = 0;

  // Parse chunks
  while (offset < arrayBuffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataStart = offset + 8;
      dataLength = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++; // Padding
  }

  if (dataStart === 0) {
    throw new Error("No data chunk found in WAV file");
  }

  const bytesPerSample = bitsPerSample / 8;
  const samplesPerChannel = Math.floor(dataLength / (bytesPerSample * channels));

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(new Float32Array(samplesPerChannel));
  }

  // Read samples
  let sampleOffset = dataStart;
  for (let i = 0; i < samplesPerChannel; i++) {
    for (let c = 0; c < channels; c++) {
      let value: number;
      if (bitsPerSample === 16) {
        value = view.getInt16(sampleOffset, true) / 32768;
      } else if (bitsPerSample === 24) {
        const b0 = view.getUint8(sampleOffset);
        const b1 = view.getUint8(sampleOffset + 1);
        const b2 = view.getInt8(sampleOffset + 2);
        value = ((b2 << 16) | (b1 << 8) | b0) / 8388608;
      } else if (bitsPerSample === 32) {
        value = view.getFloat32(sampleOffset, true);
      } else {
        value = (view.getUint8(sampleOffset) - 128) / 128;
      }
      channelData[c][i] = value;
      sampleOffset += bytesPerSample;
    }
  }

  return { channelData, sampleRate, length: samplesPerChannel };
}
```

**Step 5: Run type check**

Run: `bun check-types`
Expected: Should pass for backend package.

**Step 6: Commit**

```bash
git add packages/backend/convex/waveform.ts
git commit -m "$(cat <<'EOF'
feat(backend): add waveform generation action

- generateWaveform: Node.js action that decodes audio and generates mipmaps
- Binary encoding for compact storage (~40KB per minute)
- 4 mipmap levels: 256, 1024, 4096, 16384 samples per bucket
- WAV decoder for initial implementation (other formats TBD)
- setWaveformStorageId: internal mutation for updating audio file

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update Frontend Clip Types and Optimistic Updates

**Files:**

- Modify: `apps/web/src/lib/clipOptimisticUpdates.ts`

**Step 1: Update type definitions**

Replace `fileId` with `audioFileId` and remove `audioDuration`:

```typescript
import type { Doc, Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { tempId, updateOptimisticQuery, withProjectIdGuard } from "./optimistic";

type Clip = Doc<"clips">;

// Args types for each mutation
type CreateClipArgs = {
  projectId: Id<"projects">;
  trackId: Id<"tracks">;
  audioFileId: Id<"audioFiles">; // Changed from fileId
  name: string;
  startTime: number;
  duration: number;
};

type UpdateClipPositionArgs = {
  id: Id<"clips">;
  startTime: number;
  trackId?: Id<"tracks">;
  projectId?: Id<"projects">;
};

type DeleteClipArgs = {
  id: Id<"clips">;
  projectId?: Id<"projects">;
};

type TrimClipArgs = {
  id: Id<"clips">;
  startTime: number;
  audioStartTime: number;
  duration: number;
  projectId?: Id<"projects">;
};

type PasteClipsArgs = {
  projectId: Id<"projects">;
  trackId: Id<"tracks">;
  clips: Array<{
    audioFileId: Id<"audioFiles">; // Changed from fileId
    name: string;
    startTime: number;
    duration: number;
    audioStartTime: number;
    gain: number;
  }>;
};

type SplitClipArgs = {
  id: Id<"clips">;
  splitTime: number;
  projectId?: Id<"projects">;
};
```

**Step 2: Update createClipOptimisticUpdate**

```typescript
export function createClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: CreateClipArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.clips.getProjectClips,
    { projectId: args.projectId },
    (current) => {
      const now = Date.now();
      const newClip: Clip = {
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: args.projectId,
        trackId: args.trackId,
        audioFileId: args.audioFileId, // Changed from fileId
        name: args.name,
        startTime: args.startTime,
        duration: args.duration,
        audioStartTime: 0,
        gain: 0,
        createdAt: now,
        updatedAt: now,
      };
      return [...current, newClip];
    },
  );
}
```

**Step 3: Update pasteClipsOptimisticUpdate**

```typescript
export function pasteClipsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: PasteClipsArgs,
): void {
  updateOptimisticQuery(
    localStore,
    api.clips.getProjectClips,
    { projectId: args.projectId },
    (current) => {
      const now = Date.now();
      const newClips: Clip[] = args.clips.map((clip) => ({
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: args.projectId,
        trackId: args.trackId,
        audioFileId: clip.audioFileId, // Changed from fileId
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      }));
      return [...current, ...newClips];
    },
  );
}
```

**Step 4: Update splitClipOptimisticUpdate**

Remove `audioDuration` references:

```typescript
export function splitClipOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: SplitClipArgs,
): void {
  withProjectIdGuard(args.projectId, (projectId) => {
    updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, (current) => {
      const clip = current.find((c) => c._id === args.id);
      if (!clip) return current;

      const clipEnd = clip.startTime + clip.duration;

      // FR-39: Split only if splitTime is within clip bounds
      if (args.splitTime <= clip.startTime || args.splitTime >= clipEnd) {
        return current;
      }

      const now = Date.now();
      const leftDuration = args.splitTime - clip.startTime;
      const rightStartTime = args.splitTime;
      const rightDuration = clipEnd - args.splitTime;
      const rightAudioStartTime = clip.audioStartTime + leftDuration;

      const rightClip: Clip = {
        _id: tempId<"clips">(),
        _creationTime: now,
        projectId: clip.projectId,
        trackId: clip.trackId,
        audioFileId: clip.audioFileId, // Changed from fileId
        name: clip.name,
        startTime: rightStartTime,
        duration: rightDuration,
        audioStartTime: rightAudioStartTime,
        gain: clip.gain,
        createdAt: now,
        updatedAt: now,
      };

      const updated = current.map((c) =>
        c._id !== args.id ? c : { ...c, duration: leftDuration, updatedAt: now },
      );

      return [...updated, rightClip];
    });
  });
}
```

**Step 5: Run type check**

Run: `bun check-types`
Expected: May show errors in other frontend files referencing old types.

**Step 6: Commit**

```bash
git add apps/web/src/lib/clipOptimisticUpdates.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): update clip optimistic updates for audioFileId

- Replace fileId with audioFileId in all type definitions
- Remove audioDuration from clip types
- Update createClip, pasteClips, splitClip optimistic updates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update useTimelineFileDrop Hook

**Files:**

- Modify: `apps/web/src/hooks/useTimelineFileDrop.ts`

**Step 1: Add audioFiles mutation imports**

```typescript
import type { Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { isSupportedAudioType, MAX_FILE_SIZE } from "@el-audio-daw/backend/convex/constants";
import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
// ... rest of imports
```

**Step 2: Update mutations in hook**

Replace single `generateUploadUrl` with the new flow:

```typescript
export function useTimelineFileDrop({
  // ... existing params
}: UseTimelineFileDropOptions): UseTimelineFileDropReturn {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Mutations for file upload
  const generateUploadUrl = useMutation(api.clips.generateUploadUrl);
  const validateUploadedFile = useMutation(api.clips.validateUploadedFile);
  const createAudioFile = useMutation(api.audioFiles.createAudioFile);
  const createClip = useMutation(api.clips.createClip);
  const generateWaveform = useAction(api.waveform.generateWaveform);

  // ... rest of refs and callbacks
```

**Step 3: Update handleFileDrop to create audioFile first**

Replace the file drop handler:

```typescript
const handleFileDrop = useCallback(
  async (file: File, dropPosition: DropTarget) => {
    // Client-side validation
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        `File too large. Maximum size is 100MB, got ${Math.round(file.size / 1024 / 1024)}MB`,
      );
      return;
    }

    if (!isAudioFile(file)) {
      toast.error("Unsupported audio format. Supported formats: WAV, MP3, AIFF, FLAC, OGG");
      return;
    }

    const trackId = dropPosition.trackId as Id<"tracks">;

    // Register this upload with the upload registry for cancellation support
    const abortController = registerUpload(trackId, file.name);

    setIsUploading(true);

    try {
      // Decode audio to get duration and metadata
      const { durationInSamples, fileSampleRate, channels } = await decodeAudioFile(file);

      // Show warning if sample rates differ
      if (fileSampleRate !== sampleRate) {
        toast.warning(
          `Sample rate mismatch: file is ${fileSampleRate}Hz, project is ${sampleRate}Hz. Playback may be affected.`,
        );
      }

      // Generate upload URL
      const uploadUrl = await generateUploadUrl({ projectId });

      // Check if aborted before starting fetch
      if (abortController.signal.aborted) {
        return;
      }

      // Upload file to Convex storage
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };

      // Check if aborted after upload
      if (abortController.signal.aborted) {
        return;
      }

      // Validate uploaded file
      await validateUploadedFile({
        storageId,
        projectId,
        contentType: file.type,
        size: file.size,
      });

      // Check if aborted after validation
      if (abortController.signal.aborted) {
        return;
      }

      // Create audio file record
      const clipName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const audioFileId = await createAudioFile({
        projectId,
        storageId,
        name: clipName,
        duration: durationInSamples,
        sampleRate: fileSampleRate,
        channels,
      });

      // Create clip record referencing the audio file
      await createClip({
        projectId,
        trackId,
        audioFileId,
        name: clipName,
        startTime: dropPosition.dropTimeInSamples,
        duration: durationInSamples,
      });

      toast.success(`Added "${clipName}" to timeline`);

      // Schedule waveform generation in background (don't await)
      generateWaveform({ audioFileId, storageId }).catch((error) => {
        console.warn("Waveform generation failed:", error);
        // Don't show error to user - waveform is optional
      });
    } catch (error) {
      // Don't show error toast for intentional cancellation (AbortError)
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to upload audio file:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload audio file");
    } finally {
      unregisterUpload(trackId, abortController);
      setIsUploading(false);
    }
  },
  [
    isAudioFile,
    decodeAudioFile,
    generateUploadUrl,
    validateUploadedFile,
    createAudioFile,
    createClip,
    generateWaveform,
    projectId,
    sampleRate,
  ],
);
```

**Step 4: Update decodeAudioFile to return channels**

```typescript
const decodeAudioFile = useCallback(
  async (file: File): Promise<{ durationInSamples: number; fileSampleRate: number; channels: number }> => {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate });
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return {
        durationInSamples: audioBuffer.length,
        fileSampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
      };
    } finally {
      await audioContext.close();
    }
  },
  [sampleRate],
);
```

**Step 5: Run type check**

Run: `bun check-types`
Expected: May show errors in other files.

**Step 6: Commit**

```bash
git add apps/web/src/hooks/useTimelineFileDrop.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): update file drop to create audioFile first

- Create audioFile record before clip
- Pass audioFileId to createClip instead of fileId
- Schedule waveform generation in background after upload
- Extract channel count from decoded audio

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update useClipClipboard Hook

**Files:**

- Modify: `apps/web/src/hooks/useClipClipboard.ts`

**Step 1: Update clipboard data types**

Replace `fileId` with `audioFileId`, remove `audioDuration`:

```typescript
interface ClipboardClip {
  /** Audio file reference for storage */
  audioFileId: Id<"audioFiles">; // Changed from fileId
  /** Clip name */
  name: string;
  /** Clip duration in samples */
  duration: number;
  /** Offset into source audio in samples */
  audioStartTime: number;
  /** Clip gain in dB */
  gain: number;
  /** Offset from first clip's start time (for maintaining relative positions) */
  offsetFromFirst: number;
}
```

**Step 2: Update copyClips function parameter type**

```typescript
const copyClips = useCallback(
  (
    clipIds: Set<string>,
    clipsData: Array<{
      _id: string;
      trackId: string;
      audioFileId: Id<"audioFiles">; // Changed from fileId
      name: string;
      startTime: number;
      duration: number;
      audioStartTime: number;
      gain: number;
    }>,
  ) => {
    // ... implementation
```

**Step 3: Update the mapping in copyClips**

```typescript
const clipboardClips: ClipboardClip[] = matchingClips.map((clip) => ({
  audioFileId: clip.audioFileId, // Changed from fileId
  name: clip.name,
  duration: clip.duration,
  audioStartTime: clip.audioStartTime,
  gain: clip.gain,
  offsetFromFirst: clip.startTime - firstClipStartTime,
}));
```

**Step 4: Run type check**

Run: `bun check-types`

**Step 5: Commit**

```bash
git add apps/web/src/hooks/useClipClipboard.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): update clipboard to use audioFileId

- Replace fileId with audioFileId in clipboard types
- Remove audioDuration from clipboard data

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update useClipDrag Hook

**Files:**

- Modify: `apps/web/src/hooks/useClipDrag.ts`

**Step 1: Update ClipData interface**

Remove `audioDuration`:

```typescript
export interface ClipData {
  _id: string;
  trackId: string;
  audioFileId: string; // Changed from fileId
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // offset into source audio in samples
  pending?: boolean; // true if clip is awaiting server confirmation
}
```

**Step 2: Run type check**

Run: `bun check-types`

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useClipDrag.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): update ClipData to use audioFileId

- Replace fileId with audioFileId
- Remove audioDuration from ClipData

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update useClipTrim Hook

**Files:**

- Modify: `apps/web/src/hooks/useClipTrim.ts`

**Step 1: Update TrimDragState to not require audioDuration from clip**

The trim hook needs audioDuration for validation. Since clips no longer have it, we need to pass it from the audioFiles data. For now, we'll require it in the clip data passed to findClipAtPosition or fetch it separately.

Update the interface to get audioDuration from a lookup:

```typescript
interface TrimDragState {
  clipId: string;
  handle: "left" | "right";
  initialMouseX: number;
  originalStartTime: number;
  originalAudioStartTime: number;
  originalDuration: number;
  audioDuration: number; // Still needed for validation - passed from audioFiles
  currentStartTime: number;
  currentAudioStartTime: number;
  currentDuration: number;
}
```

Note: The audioDuration will need to be provided when starting a trim. This requires changes to the component that uses this hook to look up the audioDuration from audioFiles.

**Step 2: Add audioDuration lookup parameter**

Add a parameter for looking up audioDuration:

```typescript
interface UseClipTrimOptions {
  pixelsPerSecond: number;
  sampleRate: number;
  projectId: Id<"projects">;
  findClipAtPosition: (canvasX: number, canvasY: number) => { clip: ClipData; zone: string } | null;
  trimClip: (args: TrimClipArgs) => Promise<void>;
  getAudioFileDuration?: (audioFileId: string) => number | undefined; // New
}
```

This will be wired up in a later task when we have the audioFiles query available.

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useClipTrim.ts
git commit -m "$(cat <<'EOF'
refactor(frontend): prepare useClipTrim for audioFiles integration

- Note: audioDuration now comes from audioFiles, not clips
- Will be fully wired up when audioFiles query is available

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update Project Route Component

**Files:**

- Modify: `apps/web/src/routes/project.$id.tsx`

**Step 1: Add audioFiles query**

Add query near other queries (around line 186):

```typescript
const audioFiles = useQuery(api.audioFiles.getProjectAudioFiles, { projectId: id as any });
const waveformUrls = useQuery(api.audioFiles.getProjectWaveformUrls, { projectId: id as any });
```

**Step 2: Update clip data mapping**

Update the clips mapping to use audioFileId and get audioDuration from audioFiles (around line 641):

```typescript
// Create audioFile lookup map
const audioFilesMap = new Map(
  (audioFiles ?? []).map((af) => [af._id, af])
);

// In TimelineCanvas clips prop:
clips={(clips ?? []).map((clip) => {
  const audioFile = audioFilesMap.get(clip.audioFileId);
  return {
    _id: clip._id,
    trackId: clip.trackId,
    audioFileId: clip.audioFileId,
    name: clip.name,
    startTime: clip.startTime,
    duration: clip.duration,
    audioStartTime: clip.audioStartTime,
    audioDuration: audioFile?.duration ?? clip.duration, // Fallback to clip duration
    pending: isPending(clip),
  };
})}
```

**Step 3: Update clipboard copy handler**

Update handleCopyClips to use audioFileId:

```typescript
const handleCopyClips = useCallback(() => {
  if (selectedClipIds.size === 0 || !clips) return;

  const clipsWithData = clips.map((clip) => ({
    _id: clip._id,
    trackId: clip.trackId,
    audioFileId: clip.audioFileId,
    name: clip.name,
    startTime: clip.startTime,
    duration: clip.duration,
    audioStartTime: clip.audioStartTime,
    gain: clip.gain,
  }));

  copyClips(selectedClipIds, clipsWithData);
}, [selectedClipIds, clips, copyClips]);
```

**Step 4: Update paste handler**

Update handlePasteClips to use audioFileId:

```typescript
const clipsToCreate = clipboardData.clips.map((clip) => ({
  audioFileId: clip.audioFileId,
  name: clip.name,
  startTime: playheadTimeInSamples + clip.offsetFromFirst,
  duration: clip.duration,
  audioStartTime: clip.audioStartTime,
  gain: clip.gain,
}));
```

**Step 5: Pass waveformUrls to TimelineCanvas**

Add prop to TimelineCanvas:

```typescript
<TimelineCanvas
  // ... existing props
  waveformUrls={waveformUrls ?? {}}
  audioFiles={audioFiles ?? []}
/>
```

**Step 6: Update TimelineCanvasProps interface**

```typescript
interface TimelineCanvasProps {
  tracks: { _id: string; name: string }[];
  clips: ClipData[];
  sampleRate: number;
  playheadTime: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
  projectId: Id<"projects">;
  selectedClipIds: Set<string>;
  onSelectClip: (clipId: string, trackId: string) => void;
  onToggleClipSelection: (clipId: string, trackId: string) => void;
  onClearSelection: () => void;
  waveformUrls: Record<string, string | null>; // New
  audioFiles: Array<{ _id: string; duration: number; sampleRate: number }>; // New
}
```

**Step 7: Run type check**

Run: `bun check-types`

**Step 8: Commit**

```bash
git add apps/web/src/routes/project.$id.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): update project route for audioFiles

- Add audioFiles and waveformUrls queries
- Update clip data mapping to use audioFileId
- Get audioDuration from audioFiles lookup
- Pass waveformUrls to TimelineCanvas for rendering

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Create Waveform Cache Module

**Files:**

- Create: `apps/web/src/lib/waveformCache.ts`

**Step 1: Create types and cache structure**

```typescript
/**
 * Client-side waveform data cache.
 * Fetches, parses, and caches waveform binary files.
 */

export interface WaveformLevel {
  samplesPerBucket: number;
  buckets: [number, number][]; // [min, max] pairs
}

export interface WaveformData {
  version: number;
  sampleRate: number;
  channels: number;
  totalSamples: number;
  levels: WaveformLevel[];
}

// In-memory cache keyed by audioFileId
const waveformCache = new Map<string, WaveformData>();

// Pending fetches to avoid duplicate requests
const pendingFetches = new Map<string, Promise<WaveformData | null>>();
```

**Step 2: Add binary decoder**

```typescript
/**
 * Decode binary waveform data.
 */
function decodeWaveformBinary(buffer: ArrayBuffer): WaveformData {
  const view = new DataView(buffer);
  let offset = 0;

  // Header
  const version = view.getUint8(offset);
  offset += 1;
  const sampleRate = view.getUint32(offset, true);
  offset += 4;
  const channels = view.getUint8(offset);
  offset += 1;
  const totalSamples = view.getUint32(offset, true);
  offset += 4;
  const levelCount = view.getUint8(offset);
  offset += 1;

  // Levels
  const levels: WaveformLevel[] = [];
  for (let i = 0; i < levelCount; i++) {
    const samplesPerBucket = view.getUint32(offset, true);
    offset += 4;
    const bucketCount = view.getUint32(offset, true);
    offset += 4;

    const buckets: [number, number][] = [];
    for (let j = 0; j < bucketCount; j++) {
      const min = view.getFloat32(offset, true);
      offset += 4;
      const max = view.getFloat32(offset, true);
      offset += 4;
      buckets.push([min, max]);
    }

    levels.push({ samplesPerBucket, buckets });
  }

  return { version, sampleRate, channels, totalSamples, levels };
}
```

**Step 3: Add fetch and cache functions**

```typescript
/**
 * Fetch and cache waveform data for an audio file.
 * Returns null if fetch fails or URL is null.
 */
export async function fetchWaveform(
  audioFileId: string,
  url: string | null,
): Promise<WaveformData | null> {
  // Return cached data if available
  const cached = waveformCache.get(audioFileId);
  if (cached) return cached;

  // No URL means waveform not yet generated
  if (!url) return null;

  // Check for pending fetch
  const pending = pendingFetches.get(audioFileId);
  if (pending) return pending;

  // Start new fetch
  const fetchPromise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to fetch waveform for ${audioFileId}: ${response.status}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const data = decodeWaveformBinary(buffer);

      // Cache the result
      waveformCache.set(audioFileId, data);

      return data;
    } catch (error) {
      console.warn(`Error fetching waveform for ${audioFileId}:`, error);
      return null;
    } finally {
      pendingFetches.delete(audioFileId);
    }
  })();

  pendingFetches.set(audioFileId, fetchPromise);
  return fetchPromise;
}

/**
 * Get cached waveform data (synchronous).
 * Returns undefined if not cached.
 */
export function getCachedWaveform(audioFileId: string): WaveformData | undefined {
  return waveformCache.get(audioFileId);
}

/**
 * Check if waveform is cached.
 */
export function isWaveformCached(audioFileId: string): boolean {
  return waveformCache.has(audioFileId);
}

/**
 * Clear waveform cache (e.g., when leaving project).
 */
export function clearWaveformCache(): void {
  waveformCache.clear();
  pendingFetches.clear();
}

/**
 * Select appropriate mipmap level for current zoom.
 */
export function selectMipmapLevel(
  waveform: WaveformData,
  samplesPerPixel: number,
): WaveformLevel {
  // Find the level with samplesPerBucket <= samplesPerPixel
  // This ensures we have enough detail without wasting data
  for (const level of waveform.levels) {
    if (level.samplesPerBucket <= samplesPerPixel) {
      return level;
    }
  }
  // Fallback to coarsest level
  return waveform.levels[waveform.levels.length - 1];
}
```

**Step 4: Run type check**

Run: `bun check-types`

**Step 5: Commit**

```bash
git add apps/web/src/lib/waveformCache.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add waveform cache module

- Binary decoder for waveform data format
- In-memory cache keyed by audioFileId
- Deduplication of concurrent fetches
- Mipmap level selection for zoom

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Create Waveform Renderer

**Files:**

- Create: `apps/web/src/lib/waveformRenderer.ts`

**Step 1: Create waveform drawing function**

```typescript
/**
 * Waveform rendering functions for canvas.
 */

import type { WaveformData } from "./waveformCache";
import { selectMipmapLevel } from "./waveformCache";

interface DrawWaveformOptions {
  ctx: CanvasRenderingContext2D;
  waveform: WaveformData;
  /** Clip rectangle in canvas coordinates */
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  /** Audio offset in samples (for trimmed clips) */
  audioStartTime: number;
  /** Clip duration in samples */
  clipDuration: number;
  /** Project sample rate */
  sampleRate: number;
  /** Current zoom level */
  pixelsPerSecond: number;
  /** Track color for waveform fill */
  color: string;
}

/**
 * Draw waveform inside a clip rectangle.
 */
export function drawWaveform(options: DrawWaveformOptions): void {
  const {
    ctx,
    waveform,
    clipX,
    clipY,
    clipWidth,
    clipHeight,
    audioStartTime,
    clipDuration,
    sampleRate,
    pixelsPerSecond,
    color,
  } = options;

  // Calculate samples per pixel at current zoom
  const samplesPerPixel = sampleRate / pixelsPerSecond;

  // Select appropriate mipmap level
  const level = selectMipmapLevel(waveform, samplesPerPixel);

  // Calculate which buckets are visible
  const startBucket = Math.floor(audioStartTime / level.samplesPerBucket);
  const endSample = audioStartTime + clipDuration;
  const endBucket = Math.ceil(endSample / level.samplesPerBucket);

  // Clamp to valid range
  const firstBucket = Math.max(0, startBucket);
  const lastBucket = Math.min(level.buckets.length - 1, endBucket);

  if (firstBucket > lastBucket) return;

  // Calculate pixels per bucket at current zoom
  const pixelsPerBucket = (level.samplesPerBucket / sampleRate) * pixelsPerSecond;

  // Waveform vertical padding (80% of clip height)
  const waveformHeight = clipHeight * 0.8;
  const centerY = clipY + clipHeight / 2;
  const halfHeight = waveformHeight / 2;

  // Draw waveform
  ctx.save();
  ctx.beginPath();

  // Clip to clip bounds
  ctx.rect(clipX, clipY, clipWidth, clipHeight);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;

  for (let i = firstBucket; i <= lastBucket; i++) {
    const bucket = level.buckets[i];
    if (!bucket) continue;

    const [min, max] = bucket;

    // Calculate x position relative to clip start
    const bucketStartSample = i * level.samplesPerBucket;
    const sampleOffset = bucketStartSample - audioStartTime;
    const x = clipX + (sampleOffset / sampleRate) * pixelsPerSecond;

    // Skip if outside visible clip area
    if (x + pixelsPerBucket < clipX || x > clipX + clipWidth) continue;

    // Calculate bar dimensions
    const barWidth = Math.max(1, pixelsPerBucket);
    const barTop = centerY + min * halfHeight; // min is negative
    const barBottom = centerY + max * halfHeight; // max is positive
    const barHeight = barBottom - barTop;

    ctx.fillRect(x, barTop, barWidth, barHeight);
  }

  ctx.restore();
}

/**
 * Check if waveform should be drawn (clip is wide enough).
 */
export function shouldDrawWaveform(clipWidth: number): boolean {
  // Only draw waveform if clip is wider than 10 pixels
  return clipWidth > 10;
}
```

**Step 2: Run type check**

Run: `bun check-types`

**Step 3: Commit**

```bash
git add apps/web/src/lib/waveformRenderer.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add waveform renderer module

- drawWaveform: renders waveform inside clip bounds
- Selects appropriate mipmap level for zoom
- Clips drawing to clip rectangle
- 60% opacity track color fill

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Integrate Waveform Rendering into Canvas

**Files:**

- Modify: `apps/web/src/lib/canvasRenderer.ts`

**Step 1: Add imports**

```typescript
import { drawWaveform, shouldDrawWaveform } from "./waveformRenderer";
import type { WaveformData } from "./waveformCache";
```

**Step 2: Update ClipRenderData interface**

Add audioFileId and audioDuration:

```typescript
export interface ClipRenderData {
  _id: string;
  trackId: string;
  audioFileId: string; // New
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // New - offset into source audio
  audioDuration: number; // New - total audio file duration
  pending?: boolean;
  selected?: boolean;
  hoverZone?: ClipHoverZone | null;
}
```

**Step 3: Update DrawClipsOptions interface**

Add waveform cache:

```typescript
interface DrawClipsOptions {
  renderCtx: TimelineRenderContext;
  clips: ClipRenderData[];
  trackIndexMap: Map<string, number>;
  sampleRate: number;
  clipDragState: ClipDragState | null;
  trimDragState: TrimDragState | null;
  waveformCache: Map<string, WaveformData>; // New
}
```

**Step 4: Update drawClips function to render waveforms**

After drawing clip background (around line 298), add waveform rendering:

```typescript
// Draw clip background
ctx.fillStyle = trackColor;
ctx.globalAlpha = isPending ? 0.4 : isDragging ? 0.5 : 0.7;
ctx.beginPath();
ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
ctx.fill();

// Draw waveform if available and clip is wide enough
if (!isPending && shouldDrawWaveform(clipWidth)) {
  const waveform = waveformCache.get(clip.audioFileId);
  if (waveform) {
    drawWaveform({
      ctx,
      waveform,
      clipX,
      clipY,
      clipWidth,
      clipHeight,
      audioStartTime: clip.audioStartTime,
      clipDuration: effectiveDuration,
      sampleRate,
      pixelsPerSecond,
      color: trackColor,
    });
  }
}
```

**Step 5: Update renderTimeline function**

Add waveformCache parameter:

```typescript
interface RenderTimelineOptions {
  // ... existing options
  waveformCache: Map<string, WaveformData>; // New
}

export function renderTimeline(options: RenderTimelineOptions): void {
  // ... existing code

  drawClips({
    renderCtx,
    clips,
    trackIndexMap,
    sampleRate,
    clipDragState,
    trimDragState,
    waveformCache: options.waveformCache, // New
  });

  // ... rest of code
}
```

**Step 6: Run type check**

Run: `bun check-types`

**Step 7: Commit**

```bash
git add apps/web/src/lib/canvasRenderer.ts
git commit -m "$(cat <<'EOF'
feat(frontend): integrate waveform rendering into canvas

- Add audioFileId, audioStartTime, audioDuration to ClipRenderData
- Add waveformCache to DrawClipsOptions
- Render waveform after clip background, before border/handles
- Skip waveform for pending clips and narrow clips

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Wire Up Waveform Fetching in TimelineCanvas

**Files:**

- Modify: `apps/web/src/routes/project.$id.tsx`

**Step 1: Add waveform cache imports and state**

```typescript
import { fetchWaveform, getCachedWaveform, clearWaveformCache, type WaveformData } from "@/lib/waveformCache";
```

In TimelineCanvas component:

```typescript
function TimelineCanvas({
  // ... existing props
  waveformUrls,
  audioFiles,
}: TimelineCanvasProps) {
  // ... existing state

  // Waveform cache state (triggers re-render when waveforms load)
  const [loadedWaveforms, setLoadedWaveforms] = useState<Map<string, WaveformData>>(new Map());
```

**Step 2: Add effect to fetch waveforms**

```typescript
// Fetch waveforms when URLs become available
useEffect(() => {
  const fetchAllWaveforms = async () => {
    const entries = Object.entries(waveformUrls);

    for (const [audioFileId, url] of entries) {
      // Skip if already loaded or no URL
      if (loadedWaveforms.has(audioFileId) || !url) continue;

      const waveform = await fetchWaveform(audioFileId, url);
      if (waveform) {
        setLoadedWaveforms(prev => new Map(prev).set(audioFileId, waveform));
      }
    }
  };

  fetchAllWaveforms();
}, [waveformUrls, loadedWaveforms]);

// Clear cache when unmounting
useEffect(() => {
  return () => clearWaveformCache();
}, []);
```

**Step 3: Pass waveform cache to renderTimeline**

```typescript
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  renderTimeline({
    canvas,
    dimensions,
    tracks,
    clips: clipsWithState,
    sampleRate,
    playheadTime,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    hoverX,
    clipDragState: clipDragState
      ? {
          clipId: clipDragState.clipId,
          currentStartTime: clipDragState.currentStartTime,
          currentTrackId: clipDragState.currentTrackId,
        }
      : null,
    trimDragState: trimDragState
      ? {
          clipId: trimDragState.clipId,
          currentStartTime: trimDragState.currentStartTime,
          currentDuration: trimDragState.currentDuration,
        }
      : null,
    rulerHeight: RULER_HEIGHT,
    trackHeight: TRACK_HEIGHT,
    dragOriginalTrackId: clipDragState?.originalTrackId,
    waveformCache: loadedWaveforms, // New
  });
}, [
  // ... existing dependencies
  loadedWaveforms, // New
]);
```

**Step 4: Run type check**

Run: `bun check-types`

**Step 5: Commit**

```bash
git add apps/web/src/routes/project.$id.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): wire up waveform fetching in TimelineCanvas

- Add loadedWaveforms state to track fetched waveforms
- Fetch waveforms when URLs become available
- Pass waveformCache to renderTimeline
- Clear cache on unmount

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Add Loading State Shimmer for Waveforms

**Files:**

- Modify: `apps/web/src/lib/canvasRenderer.ts`

**Step 1: Add shimmer animation function**

```typescript
/**
 * Draw a subtle shimmer effect for clips waiting for waveform.
 */
function drawWaveformLoadingShimmer(
  ctx: CanvasRenderingContext2D,
  clipX: number,
  clipY: number,
  clipWidth: number,
  clipHeight: number,
  time: number,
): void {
  ctx.save();

  // Create shimmer gradient that moves over time
  const shimmerWidth = clipWidth * 0.3;
  const offset = ((time / 1000) % 2) * (clipWidth + shimmerWidth) - shimmerWidth;

  const gradient = ctx.createLinearGradient(
    clipX + offset,
    0,
    clipX + offset + shimmerWidth,
    0,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.beginPath();
  ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
  ctx.clip();

  ctx.fillStyle = gradient;
  ctx.fillRect(clipX, clipY, clipWidth, clipHeight);

  ctx.restore();
}
```

**Step 2: Update DrawClipsOptions to include animation time**

```typescript
interface DrawClipsOptions {
  // ... existing options
  waveformCache: Map<string, WaveformData>;
  animationTime?: number; // New - for shimmer animation
}
```

**Step 3: Add shimmer drawing for clips without waveform**

After drawing clip background, before waveform:

```typescript
// Draw waveform or shimmer
if (!isPending && shouldDrawWaveform(clipWidth)) {
  const waveform = waveformCache.get(clip.audioFileId);
  if (waveform) {
    drawWaveform({
      ctx,
      waveform,
      clipX,
      clipY,
      clipWidth,
      clipHeight,
      audioStartTime: clip.audioStartTime,
      clipDuration: effectiveDuration,
      sampleRate,
      pixelsPerSecond,
      color: trackColor,
    });
  } else if (animationTime !== undefined) {
    // Show shimmer while waveform is loading
    drawWaveformLoadingShimmer(ctx, clipX, clipY, clipWidth, clipHeight, animationTime);
  }
}
```

**Step 4: Update renderTimeline to pass animation time**

```typescript
interface RenderTimelineOptions {
  // ... existing options
  animationTime?: number; // New
}

export function renderTimeline(options: RenderTimelineOptions): void {
  // ... existing code

  drawClips({
    renderCtx,
    clips,
    trackIndexMap,
    sampleRate,
    clipDragState,
    trimDragState,
    waveformCache: options.waveformCache,
    animationTime: options.animationTime, // New
  });

  // ... rest
}
```

**Step 5: Run type check**

Run: `bun check-types`

**Step 6: Commit**

```bash
git add apps/web/src/lib/canvasRenderer.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add shimmer loading state for waveforms

- drawWaveformLoadingShimmer: animated gradient effect
- Shows when waveform is not yet loaded
- Skipped for pending clips

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Add Animation Loop for Shimmer

**Files:**

- Modify: `apps/web/src/routes/project.$id.tsx`

**Step 1: Add animation time state**

```typescript
const [animationTime, setAnimationTime] = useState(0);
```

**Step 2: Add animation frame effect**

Only run animation when there are clips without waveforms:

```typescript
// Animation loop for waveform loading shimmer
useEffect(() => {
  // Check if any clips are missing waveforms
  const hasMissingWaveforms = clips.some(
    (clip) => !loadedWaveforms.has(clip.audioFileId) && waveformUrls[clip.audioFileId] !== undefined
  );

  if (!hasMissingWaveforms) return;

  let animationId: number;
  const animate = () => {
    setAnimationTime(Date.now());
    animationId = requestAnimationFrame(animate);
  };

  animationId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(animationId);
}, [clips, loadedWaveforms, waveformUrls]);
```

**Step 3: Pass animationTime to renderTimeline**

```typescript
renderTimeline({
  // ... existing options
  waveformCache: loadedWaveforms,
  animationTime, // New
});
```

**Step 4: Add animationTime to dependencies**

```typescript
}, [
  // ... existing dependencies
  loadedWaveforms,
  animationTime, // New
]);
```

**Step 5: Run type check**

Run: `bun check-types`

**Step 6: Commit**

```bash
git add apps/web/src/routes/project.$id.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add animation loop for waveform shimmer

- Only runs when clips are waiting for waveforms
- Passes animationTime to renderTimeline
- Automatically stops when all waveforms loaded

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Final Type Check and Lint

**Step 1: Run full type check**

Run: `bun check-types`
Expected: PASS with no errors

**Step 2: Run linter**

Run: `bun check`
Expected: PASS with no errors

**Step 3: Fix any remaining issues**

If any errors, fix them and commit with descriptive message.

**Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: resolve type and lint errors

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Manual Testing Checklist

Test the following scenarios:

1. **Upload new audio file**
   - Drop WAV file on track
   - Verify clip appears immediately
   - Verify shimmer shows while waveform generates
   - Verify waveform appears after generation

2. **Zoom in/out**
   - Verify waveform renders at all zoom levels
   - Verify appropriate detail level at each zoom

3. **Trim clips**
   - Verify waveform adjusts when trimming
   - Verify audioStartTime offset works correctly

4. **Split clips**
   - Verify both resulting clips show same waveform
   - Verify audioStartTime is correct for right clip

5. **Copy/paste clips**
   - Verify pasted clips share waveform with original

6. **Scroll timeline**
   - Verify waveforms render correctly when scrolling
   - Verify no visual artifacts

---

## Summary

This plan implements waveform visualization in 17 incremental tasks:

1. Schema changes (audioFiles table, clips update)
2. Backend audioFiles module
3. Update clips.ts mutations
4. Waveform generation action
   5-9. Frontend type updates (optimistic updates, hooks)
5. Project route component updates
   11-12. Waveform cache and renderer modules
   13-14. Canvas integration
   15-16. Loading shimmer animation
6. Final verification
7. Manual testing

Each task is atomic and can be committed independently. The system will work with partial implementation (clips display without waveforms) until all tasks are complete.
