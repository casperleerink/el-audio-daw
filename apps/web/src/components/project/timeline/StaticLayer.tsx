import { memo, useMemo } from "react";
import { Group, Rect } from "react-konva";
import type Konva from "konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { getCanvasColors } from "@/lib/timelineUtils";
import type { WaveformData } from "@/lib/waveformCache";
import { TimeRuler } from "./TimeRuler";
import { TrackLane } from "./TrackLane";
import { Clip } from "./Clip";
import type { ClipRenderData } from "./types";

interface StaticLayerProps {
  width: number;
  height: number;
  tracks: { _id: string }[];
  clips: ClipRenderData[];
  sampleRate: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  selectedClipIds: Set<string>;
  clipDragState: {
    clipId: string;
    originalStartSampleFrame: number;
    originalTrackId: string;
    currentStartSampleFrame: number;
    currentTrackId: string;
  } | null;
  trimState: {
    clipId: string;
    currentStartSampleFrame: number;
    currentDurationSampleFrames: number;
  } | null;
  dragOriginalTrackId?: string | null;
  waveformCache: Map<string, WaveformData>;
  onClipClick: (clipId: string, trackId: string, shiftKey: boolean) => void;
  onClipMouseEnter?: (clipId: string) => void;
  onClipMouseLeave?: () => void;
  onBackgroundClick: (x: number) => void;
  onDragStart?: (
    e: Konva.KonvaEventObject<DragEvent>,
    clipId: string,
    trackId: string,
    startSampleFrame: number,
  ) => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, clipId: string) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>, clipId: string) => void;
  onTrimStart?: (
    clipId: string,
    edge: "left" | "right",
    startSampleFrame: number,
    sourceStartSampleFrame: number,
    durationSampleFrames: number,
    sampleId: string,
  ) => void;
  onTrimMove?: (deltaXPixels: number, clipId: string) => void;
  onTrimEnd?: (clipId: string) => void;
}

export const StaticLayer = memo(function StaticLayer({
  width,
  height,
  tracks,
  clips,
  sampleRate,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  selectedClipIds,
  clipDragState,
  trimState,
  dragOriginalTrackId,
  waveformCache,
  onClipClick,
  onClipMouseEnter,
  onClipMouseLeave,
  onBackgroundClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTrimStart,
  onTrimMove,
  onTrimEnd,
}: StaticLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  // Build track index map
  const trackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((track, index) => map.set(track._id, index));
    return map;
  }, [tracks]);

  // Viewport culling for clips
  const viewStartSeconds = scrollLeft / pixelsPerSecond;
  const visibleDurationSeconds = width / pixelsPerSecond;
  const viewEndSeconds = viewStartSeconds + visibleDurationSeconds;

  return (
    <Group>
      {/* Background — clickable for seek */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={colors.background}
        onClick={(e) => {
          const x = e.evt.offsetX;
          onBackgroundClick(x);
        }}
      />

      {/* Time ruler */}
      <TimeRuler
        width={width}
        scrollLeft={scrollLeft}
        pixelsPerSecond={pixelsPerSecond}
        borderColor={colors.border}
        mutedColor={colors.muted}
      />

      {/* Track lanes */}
      {tracks.map((track, index) => {
        const y = RULER_HEIGHT + index * TRACK_HEIGHT - scrollTop;
        if (y + TRACK_HEIGHT < RULER_HEIGHT || y > height) return null;

        const isDropTarget =
          clipDragState != null &&
          dragOriginalTrackId != null &&
          clipDragState.currentTrackId !== dragOriginalTrackId &&
          clipDragState.currentTrackId === track._id;

        return (
          <TrackLane
            key={track._id}
            trackIndex={index}
            width={width}
            scrollTop={scrollTop}
            borderColor={colors.border}
            isDropTarget={isDropTarget}
          />
        );
      })}

      {/* Clips */}
      {clips.map((clip) => {
        const trackIndex = trackIndexMap.get(clip.trackId);
        if (trackIndex === undefined) return null;

        // Determine effective position
        const isDraggedClip = clipDragState?.clipId === clip._id;
        const draggedClipWasSelected =
          clipDragState != null && selectedClipIds.has(clipDragState.clipId);
        const isDragging =
          clipDragState != null &&
          (isDraggedClip ||
            (draggedClipWasSelected &&
              selectedClipIds.has(clip._id) &&
              clip.trackId === clipDragState.originalTrackId));
        const isTrimming = trimState?.clipId === clip._id;
        const draggedOriginalTrackIndex = clipDragState
          ? trackIndexMap.get(clipDragState.originalTrackId)
          : undefined;
        const draggedCurrentTrackIndex = clipDragState
          ? trackIndexMap.get(clipDragState.currentTrackId)
          : undefined;
        const dragStartOffset = clipDragState
          ? clipDragState.currentStartSampleFrame - clipDragState.originalStartSampleFrame
          : 0;
        const dragTrackOffset =
          draggedOriginalTrackIndex !== undefined && draggedCurrentTrackIndex !== undefined
            ? draggedCurrentTrackIndex - draggedOriginalTrackIndex
            : 0;

        const effectiveStartTime = isDraggedClip
          ? clipDragState.currentStartSampleFrame
          : isDragging
            ? Math.max(0, clip.startSampleFrame + dragStartOffset)
            : isTrimming
              ? trimState.currentStartSampleFrame
              : undefined;
        const effectiveDuration = isTrimming ? trimState.currentDurationSampleFrames : undefined;
        const effectiveTrackIndex = isDraggedClip
          ? trackIndexMap.get(clipDragState.currentTrackId)
          : isDragging
            ? Math.max(0, Math.min(tracks.length - 1, trackIndex + dragTrackOffset))
            : undefined;

        // Viewport cull
        const clipStartSeconds = (effectiveStartTime ?? clip.startSampleFrame) / sampleRate;
        const clipDurationSeconds = (effectiveDuration ?? clip.durationSampleFrames) / sampleRate;
        if (
          clipStartSeconds + clipDurationSeconds < viewStartSeconds ||
          clipStartSeconds > viewEndSeconds
        )
          return null;

        return (
          <Clip
            key={clip._id}
            clip={{ ...clip, selected: selectedClipIds.has(clip._id) }}
            trackIndex={trackIndex}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            pixelsPerSecond={pixelsPerSecond}
            sampleRate={sampleRate}
            effectiveStartTime={effectiveStartTime}
            effectiveDuration={effectiveDuration}
            effectiveTrackIndex={effectiveTrackIndex}
            isDragging={isDragging}
            isTrimming={isTrimming}
            waveformData={waveformCache.get(clip.sampleId)}
            onClipClick={onClipClick}
            onClipMouseEnter={onClipMouseEnter}
            onClipMouseLeave={onClipMouseLeave}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onTrimStart={onTrimStart}
            onTrimMove={onTrimMove}
            onTrimEnd={onTrimEnd}
          />
        );
      })}
    </Group>
  );
});
