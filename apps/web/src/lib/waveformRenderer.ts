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
