# FFmpeg Waveform Decoding Design

**Date:** 2026-01-31
**Status:** Implemented

## Problem

Waveform generation fails for non-WAV files (MP3, AIFF, FLAC, OGG) because the backend only has a native WAV decoder. The error is caught silently, so waveforms simply don't appear for these formats.

## Solution

Replace the WAV-only decoder in `waveform.ts` with FFmpeg WASM to decode all supported audio formats to raw PCM data for waveform generation.

## Approach

### FFmpeg WASM

Use `@ffmpeg/ffmpeg` and `@ffmpeg/util` packages which provide FFmpeg compiled to WebAssembly. This works in Convex's Node.js action environment without requiring system binaries.

### Decoding Process

1. Load FFmpeg WASM
2. Write input audio file to FFmpeg's virtual filesystem
3. Run FFmpeg to convert to raw PCM (signed 16-bit little-endian, mono)
4. Read output and convert Int16 samples to Float32Array [-1, 1]

**FFmpeg command:**

```
ffmpeg -i input.<ext> -f s16le -ac 1 output.pcm
```

- `-f s16le`: Output format is signed 16-bit little-endian PCM
- `-ac 1`: Mix down to mono (waveforms already merge channels)

### Sample Rate Detection

Run FFmpeg probe first to detect the input file's sample rate before decoding, so we preserve it in the waveform metadata.

## File Changes

| File                                  | Change                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `packages/backend/package.json`       | Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` (latest versions)                 |
| `packages/backend/convex/waveform.ts` | Replace `decodeWav()` and `decodeAudioBuffer()` with FFmpeg-based decoder |

### Code Removal

- `decodeWav()` function (~95 lines)
- WAV-specific format detection in `decodeAudioBuffer()`

### Code Addition

- `decodeWithFFmpeg()` function (~50 lines)
- FFmpeg initialization, file I/O, and cleanup

## Error Handling

- FFmpeg load failure → throw with clear message about WASM loading
- Decode failure → throw with format-specific error
- Empty output → throw "No audio data decoded"

## Trade-offs

**Pros:**

- Supports all audio formats (WAV, MP3, AIFF, FLAC, OGG)
- Single code path for all formats
- Removes ~95 lines of custom WAV parsing

**Cons:**

- FFmpeg WASM is ~30MB (but cached by Convex runtime)
- Slightly slower than native WAV decoder for WAV files
