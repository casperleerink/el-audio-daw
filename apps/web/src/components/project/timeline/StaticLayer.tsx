import { memo, useMemo } from "react";
import { Group, Rect } from "react-konva";
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
    currentStartTime: number;
    currentTrackId: string;
  } | null;
  trimState: {
    clipId: string;
    currentStartTime: number;
    currentDuration: number;
  } | null;
  dragOriginalTrackId?: string | null;
  waveformCache: Map<string, WaveformData>;
  onClipClick: (clipId: string, trackId: string, shiftKey: boolean) => void;
  onClipMouseEnter?: (clipId: string) => void;
  onClipMouseLeave?: () => void;
  onBackgroundClick: (x: number) => void;
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
}: StaticLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  // Build track index map
  const trackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((track, index) => map.set(track._id, index));
    return map;
  }, [tracks]);

  // Viewport culling for clips
  const startTime = scrollLeft / pixelsPerSecond;
  const visibleDuration = width / pixelsPerSecond;
  const endTime = startTime + visibleDuration;

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
        const isDragging = clipDragState?.clipId === clip._id;
        const isTrimming = trimState?.clipId === clip._id;

        const effectiveStartTime = isDragging
          ? clipDragState.currentStartTime
          : isTrimming
            ? trimState.currentStartTime
            : undefined;
        const effectiveDuration = isTrimming ? trimState.currentDuration : undefined;
        const effectiveTrackIndex = isDragging
          ? trackIndexMap.get(clipDragState.currentTrackId)
          : undefined;

        // Viewport cull
        const st = (effectiveStartTime ?? clip.startTime) / sampleRate;
        const dur = (effectiveDuration ?? clip.duration) / sampleRate;
        if (st + dur < startTime || st > endTime) return null;

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
            waveformData={waveformCache.get(clip.audioFileId)}
            onClipClick={onClipClick}
            onClipMouseEnter={onClipMouseEnter}
            onClipMouseLeave={onClipMouseLeave}
          />
        );
      })}
    </Group>
  );
});
