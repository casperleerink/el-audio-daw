# Multi-Format Waveform Generation Design

**Date:** 2026-01-31
**Status:** Implemented

## Problem

Waveform generation fails for non-WAV files (MP3, AIFF, FLAC, OGG) because the backend only has a native WAV decoder. The error is caught silently, so waveforms simply don't appear for these formats.

## Solution

Move waveform generation to the client (browser) where `AudioContext.decodeAudioData()` natively supports all audio formats. The browser already decodes audio successfully for playback, so we leverage this for waveform generation.

## Approach

### Client-Side Generation

1. After decoding audio with `decodeAudioData()` (already done for duration/channels), keep the `AudioBuffer`
2. Generate waveform mipmap data from the `AudioBuffer`
3. Encode to binary format
4. Upload to Convex storage
5. Update the audioFile record with the waveform storage ID

### Why Client-Side?

- Browser's Web Audio API natively decodes MP3, AIFF, FLAC, OGG, WAV
- FFmpeg WASM doesn't work in Node.js (Convex actions)
- No additional dependencies needed
- Reuses existing audio decoding step

## File Changes

| File                                        | Change                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/lib/waveformGenerator.ts`     | New: client-side waveform generation             |
| `apps/web/src/hooks/useTimelineFileDrop.ts` | Generate and upload waveform after clip creation |
| `packages/backend/convex/waveform.ts`       | Deleted: no longer needed                        |

### Code Addition

- `generateWaveformBinary()` function in new `waveformGenerator.ts`
- Client-side waveform upload logic in `useTimelineFileDrop.ts`

### Code Removal

- Entire `packages/backend/convex/waveform.ts` file
- `@ffmpeg/ffmpeg` and `@ffmpeg/util` dependencies

## Trade-offs

**Pros:**

- Supports all browser-supported audio formats automatically
- No server-side dependencies
- Faster: no network round-trip for decoding
- Simpler: uses existing browser APIs

**Cons:**

- Slightly more client CPU usage during upload
- Waveform generation happens on user's device
