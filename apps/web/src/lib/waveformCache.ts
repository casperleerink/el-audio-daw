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
