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

/**
 * Decode WAV file to channel data.
 */
function decodeWav(arrayBuffer: ArrayBuffer): {
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
} {
  const view = new DataView(arrayBuffer);

  // Validate WAVE format at bytes 8-11
  const format = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );
  if (format !== "WAVE") {
    throw new Error("Invalid WAV file: expected WAVE format identifier");
  }

  let offset = 12; // Skip RIFF header

  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let audioFormat = 1; // 1 = PCM integer, 3 = IEEE float
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
      audioFormat = view.getUint16(offset + 8, true);
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
        if (audioFormat === 3) {
          // Float format
          value = view.getFloat32(sampleOffset, true);
        } else {
          // 32-bit integer PCM
          value = view.getInt32(sampleOffset, true) / 2147483648;
        }
      } else {
        value = (view.getUint8(sampleOffset) - 128) / 128;
      }
      channelData[c][i] = value;
      sampleOffset += bytesPerSample;
    }
  }

  return { channelData, sampleRate, length: samplesPerChannel };
}

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
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );

  if (riff === "RIFF") {
    return decodeWav(arrayBuffer);
  }

  // For other formats, we'd need additional libraries
  // For now, throw an error - can be extended later
  throw new Error(
    "Unsupported audio format. Currently only WAV is supported for waveform generation.",
  );
}

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
    const waveformStorageId = await ctx.storage.store(
      new Blob([binaryData], { type: "application/octet-stream" }),
    );

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
