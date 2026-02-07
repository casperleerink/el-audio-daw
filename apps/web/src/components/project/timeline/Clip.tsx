import { memo } from "react";
import { Group, Rect, Text } from "react-konva";
import {
  CLIP_BORDER_RADIUS,
  CLIP_PADDING,
  RULER_HEIGHT,
  TRACK_HEIGHT,
} from "@/lib/timelineConstants";
import { getTrackColor } from "@/lib/canvasRenderer";
import type { WaveformData } from "@/lib/waveformCache";
import type { ClipRenderData } from "./types";
import { Waveform } from "./Waveform";

interface ClipProps {
  clip: ClipRenderData;
  trackIndex: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  /** Override position during drag */
  effectiveStartTime?: number;
  effectiveDuration?: number;
  /** Override track index during cross-track drag */
  effectiveTrackIndex?: number;
  isDragging?: boolean;
  isTrimming?: boolean;
  waveformData?: WaveformData;
  onClipClick?: (clipId: string, trackId: string, shiftKey: boolean) => void;
  onClipMouseEnter?: (clipId: string) => void;
  onClipMouseLeave?: () => void;
}

export const Clip = memo(function Clip({
  clip,
  trackIndex: baseTrackIndex,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  effectiveStartTime,
  effectiveDuration,
  effectiveTrackIndex,
  isDragging,
  isTrimming: _isTrimming,
  waveformData,
  onClipClick,
  onClipMouseEnter,
  onClipMouseLeave,
}: ClipProps) {
  const trackIndex = effectiveTrackIndex ?? baseTrackIndex;
  const startTime = effectiveStartTime ?? clip.startTime;
  const duration = effectiveDuration ?? clip.duration;
  const isPending = clip.pending === true;
  const isSelected = clip.selected === true;

  // Calculate clip rectangle
  const startSeconds = startTime / sampleRate;
  const durationSeconds = duration / sampleRate;
  const viewStartTime = scrollLeft / pixelsPerSecond;

  const clipX = (startSeconds - viewStartTime) * pixelsPerSecond;
  const clipWidth = durationSeconds * pixelsPerSecond;
  const clipY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING;
  const clipHeight = TRACK_HEIGHT - CLIP_PADDING * 2 - 1;

  const trackColor = getTrackColor(trackIndex);

  // Determine opacity
  const bodyOpacity = isPending ? 0.4 : isDragging ? 0.5 : 0.7;
  const borderOpacity = isPending ? 0.6 : isDragging ? 0.7 : 1;

  // Truncate clip name
  const showName = clipWidth > 30;
  const textPadding = 6;

  return (
    <Group
      x={clipX}
      y={clipY}
      onClick={(e) => {
        if (isPending) return;
        onClipClick?.(clip._id, clip.trackId, e.evt.shiftKey);
        e.cancelBubble = true;
      }}
      onMouseEnter={() => onClipMouseEnter?.(clip._id)}
      onMouseLeave={() => onClipMouseLeave?.()}
    >
      {/* Clip background */}
      <Rect
        width={clipWidth}
        height={clipHeight}
        fill={trackColor}
        opacity={bodyOpacity}
        cornerRadius={CLIP_BORDER_RADIUS}
      />

      {/* Waveform */}
      {!isPending && waveformData && (
        <Waveform
          waveform={waveformData}
          clipWidth={clipWidth}
          clipHeight={clipHeight}
          audioStartTime={clip.audioStartTime}
          clipDuration={duration}
          sampleRate={sampleRate}
          pixelsPerSecond={pixelsPerSecond}
          color={trackColor}
        />
      )}

      {/* Clip border */}
      <Rect
        width={clipWidth}
        height={clipHeight}
        stroke={isSelected ? "#ffffff" : trackColor}
        strokeWidth={isSelected ? 2 : isDragging ? 2 : 1}
        opacity={borderOpacity}
        cornerRadius={CLIP_BORDER_RADIUS}
        dash={isPending ? [4, 4] : undefined}
        listening={false}
      />

      {/* Selection glow */}
      {isSelected && !isPending && (
        <Rect
          width={clipWidth}
          height={clipHeight}
          stroke="#ffffff"
          strokeWidth={1}
          opacity={0.5}
          cornerRadius={CLIP_BORDER_RADIUS}
          shadowColor="#ffffff"
          shadowBlur={4}
          listening={false}
        />
      )}

      {/* Clip name */}
      {showName && (
        <Text
          x={textPadding}
          y={0}
          width={clipWidth - textPadding * 2}
          height={clipHeight}
          text={clip.name}
          fontSize={11}
          fontFamily="sans-serif"
          fill="#ffffff"
          opacity={isPending ? 0.5 : isDragging ? 0.6 : 0.9}
          verticalAlign="middle"
          ellipsis={true}
          wrap="none"
          listening={false}
        />
      )}
    </Group>
  );
});
