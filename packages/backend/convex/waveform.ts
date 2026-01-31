"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

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
 * Decode audio file using FFmpeg WASM.
 * Supports WAV, MP3, AIFF, FLAC, OGG, and other formats.
 */
async function decodeWithFFmpeg(
  arrayBuffer: ArrayBuffer,
  inputFileName: string,
): Promise<{
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
}> {
  const ffmpeg = new FFmpeg();

  // Load FFmpeg WASM from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  try {
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, new Uint8Array(arrayBuffer));

    // First, probe to get audio info (sample rate, channels)
    // We use FFmpeg to output info to stderr, but easier to just decode and check
    // Decode to raw PCM: signed 16-bit little-endian, preserve channels and sample rate
    const outputFileName = "output.wav";

    await ffmpeg.exec([
      "-i",
      inputFileName,
      "-f",
      "wav", // Output as WAV so we can easily parse header for metadata
      "-acodec",
      "pcm_s16le",
      "-y",
      outputFileName,
    ]);

    // Read output file
    const outputData = await ffmpeg.readFile(outputFileName);
    if (!(outputData instanceof Uint8Array)) {
      throw new Error("Failed to read decoded audio data");
    }

    // Parse the WAV output to get channel data
    const wavBuffer = outputData.buffer;
    const view = new DataView(wavBuffer);

    // Parse WAV header to get format info
    let offset = 12; // Skip RIFF header
    let sampleRate = 44100;
    let channels = 2;
    let dataStart = 0;
    let dataLength = 0;

    while (offset < wavBuffer.byteLength) {
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
      } else if (chunkId === "data") {
        dataStart = offset + 8;
        dataLength = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++; // Padding
    }

    if (dataStart === 0 || dataLength === 0) {
      throw new Error("No audio data found in decoded output");
    }

    // Read 16-bit samples and convert to Float32
    const bytesPerSample = 2; // 16-bit
    const samplesPerChannel = Math.floor(dataLength / (bytesPerSample * channels));

    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      channelData.push(new Float32Array(samplesPerChannel));
    }

    let sampleOffset = dataStart;
    for (let i = 0; i < samplesPerChannel; i++) {
      for (let c = 0; c < channels; c++) {
        const value = view.getInt16(sampleOffset, true) / 32768;
        channelData[c][i] = value;
        sampleOffset += bytesPerSample;
      }
    }

    return { channelData, sampleRate, length: samplesPerChannel };
  } finally {
    ffmpeg.terminate();
  }
}

/**
 * Decode audio buffer using FFmpeg.
 * Returns channel data as Float32Arrays.
 */
async function decodeAudioBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<{
  channelData: Float32Array[];
  sampleRate: number;
  length: number;
}> {
  return decodeWithFFmpeg(arrayBuffer, fileName);
}

/**
 * Map content-type to file extension for FFmpeg input.
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/ogg": "ogg",
    "audio/vorbis": "ogg",
  };

  // Extract base type (remove parameters like charset)
  const baseType = contentType.split(";")[0].trim().toLowerCase();
  return typeMap[baseType] || "bin";
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

    // Get content-type to determine file format
    const contentType = response.headers.get("content-type") || "audio/wav";
    const extension = getExtensionFromContentType(contentType);
    const inputFileName = `input.${extension}`;

    const arrayBuffer = await response.arrayBuffer();

    // Decode audio using FFmpeg WASM
    const audioData = await decodeAudioBuffer(arrayBuffer, inputFileName);

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
    await ctx.runMutation(internal.audioFiles.setWaveformStorageId, {
      audioFileId: args.audioFileId,
      waveformStorageId,
    });

    return { success: true, waveformStorageId };
  },
});
