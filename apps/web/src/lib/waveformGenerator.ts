/**
 * Client-side waveform data generator.
 * Generates mipmap levels from AudioBuffer for efficient rendering at different zoom levels.
 */

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
 * Generate waveform mipmap data from an AudioBuffer.
 * For stereo, merges channels: max(abs(L), abs(R))
 */
function generateWaveformData(audioBuffer: AudioBuffer): WaveformData {
  const channels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;

  // Get channel data
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  // Merge channels if stereo
  const mergedData = new Float32Array(totalSamples);
  if (channels === 1) {
    mergedData.set(channelData[0]);
  } else {
    // Stereo: take max(abs(L), abs(R))
    const left = channelData[0];
    const right = channelData[1];
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

      let max = 0;
      for (let j = start; j < end; j++) {
        const value = mergedData[j];
        // For merged data, value is always positive (we took abs above)
        if (value > max) max = value;
      }
      const min = -max; // Mirror for display

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
 * Generate waveform binary data from an AudioBuffer.
 * Returns the binary data ready for upload to storage.
 */
export function generateWaveformBinary(audioBuffer: AudioBuffer): ArrayBuffer {
  const waveformData = generateWaveformData(audioBuffer);
  return encodeWaveformBinary(waveformData);
}
