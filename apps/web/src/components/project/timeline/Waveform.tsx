import { memo } from "react";
import { Shape } from "react-konva";
import type { Context } from "konva/lib/Context";
import type { Shape as ShapeType } from "konva/lib/Shape";
import type { WaveformData } from "@/lib/waveformCache";
import { selectMipmapLevel } from "@/lib/waveformCache";

interface WaveformProps {
  waveform: WaveformData;
  clipWidth: number;
  clipHeight: number;
  audioStartTime: number; // in samples
  clipDuration: number; // in samples
  sampleRate: number;
  pixelsPerSecond: number;
  color: string;
}

export const Waveform = memo(function Waveform({
  waveform,
  clipWidth,
  clipHeight,
  audioStartTime,
  clipDuration,
  sampleRate,
  pixelsPerSecond,
  color,
}: WaveformProps) {
  // Don't render if clip is too narrow
  if (clipWidth <= 10) return null;

  return (
    <Shape
      sceneFunc={(ctx: Context, shape: ShapeType) => {
        const samplesPerPixel = sampleRate / pixelsPerSecond;
        const level = selectMipmapLevel(waveform, samplesPerPixel);

        const startBucket = Math.floor(audioStartTime / level.samplesPerBucket);
        const endSample = audioStartTime + clipDuration;
        const endBucket = Math.ceil(endSample / level.samplesPerBucket);

        const firstBucket = Math.max(0, startBucket);
        const lastBucket = Math.min(level.buckets.length - 1, endBucket);

        if (firstBucket > lastBucket) return;

        const pixelsPerBucket = (level.samplesPerBucket / sampleRate) * pixelsPerSecond;
        const waveformHeight = clipHeight * 0.8;
        const centerY = clipHeight / 2;
        const halfHeight = waveformHeight / 2;

        const _ctx = ctx._context;
        _ctx.fillStyle = color;
        _ctx.globalAlpha = 0.6;

        // Clip to component bounds
        _ctx.save();
        _ctx.beginPath();
        _ctx.rect(0, 0, clipWidth, clipHeight);
        _ctx.clip();

        for (let i = firstBucket; i <= lastBucket; i++) {
          const bucket = level.buckets[i];
          if (!bucket) continue;

          const [min, max] = bucket;
          const bucketStartSample = i * level.samplesPerBucket;
          const sampleOffset = bucketStartSample - audioStartTime;
          const x = (sampleOffset / sampleRate) * pixelsPerSecond;

          if (x + pixelsPerBucket < 0 || x > clipWidth) continue;

          const barWidth = Math.max(1, pixelsPerBucket);
          const barTop = centerY + min * halfHeight;
          const barBottom = centerY + max * halfHeight;
          const barHeight = barBottom - barTop;

          _ctx.fillRect(x, barTop, barWidth, barHeight);
        }

        _ctx.restore();
        ctx.fillStrokeShape(shape);
      }}
      listening={false}
    />
  );
});
