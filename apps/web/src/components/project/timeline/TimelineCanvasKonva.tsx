import { Loader2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useZero } from "@rocicorp/zero/react";
import type Konva from "konva";

import type { ClipData } from "./types";
import { useKonvaClipDrag } from "@/hooks/useKonvaClipDrag";
import { useKonvaClipTrim } from "@/hooks/useKonvaClipTrim";
import { useKonvaPlayheadAnimation } from "@/hooks/useKonvaPlayheadAnimation";
import { useTimelineFileDrop } from "@/hooks/useTimelineFileDrop";
import { useTimelineZoom } from "@/hooks/useTimelineZoom";
import { useAudioStore } from "@/stores/audioStore";
import { fetchWaveform, clearWaveformCache, type WaveformData } from "@/lib/waveformCache";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mutators } from "@el-audio-daw/zero/mutators";

import { TimelineStage } from "./TimelineStage";
import { StaticLayer } from "./StaticLayer";
import { DynamicLayer } from "./DynamicLayer";

export interface TimelineCanvasKonvaProps {
  tracks: { _id: string; name: string }[];
  clips: ClipData[];
  sampleRate: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
  projectId: string;
  selectedClipIds: Set<string>;
  onSelectClip: (clipId: string, trackId: string) => void;
  onToggleClipSelection: (clipId: string, trackId: string) => void;
  onClearSelection: () => void;
  getAudioFileDuration: (audioFileId: string) => number | undefined;
  waveformUrls: Record<string, string | null>;
}

export function TimelineCanvasKonva({
  tracks,
  clips,
  sampleRate,
  scrollTop,
  onScrollChange,
  onSeek,
  projectId,
  selectedClipIds,
  onSelectClip,
  onToggleClipSelection,
  onClearSelection,
  getAudioFileDuration,
  waveformUrls,
}: TimelineCanvasKonvaProps) {
  const z = useZero();
  const containerRef = useRef<HTMLDivElement>(null);
  const staticLayerRef = useRef<Konva.Layer>(null);
  const dynamicLayerRef = useRef<Konva.Layer>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const isPlaying = useAudioStore((s) => s.isPlaying);

  // Waveform cache
  const [loadedWaveforms, setLoadedWaveforms] = useState<Map<string, WaveformData>>(new Map());

  // Hover state refs (perf: no React re-renders on mouse move)
  const hoverXRef = useRef<number | null>(null);
  const hoverTimeRef = useRef<number | null>(null);

  const totalTrackHeight = tracks.length * TRACK_HEIGHT;
  const viewportHeight = dimensions.height - RULER_HEIGHT;
  const maxScrollTop = Math.max(0, totalTrackHeight - viewportHeight);

  // Zoom — canvasRef not actually used by useTimelineZoom, pass null ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    scrollLeft,
    pixelsPerSecond,
    setScrollLeft,
    canZoomIn,
    canZoomOut,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoom,
  } = useTimelineZoom({ containerRef, canvasRef, hoverX: null, dimensions });

  // Zero mutations
  const updateClipPosition = useCallback(
    async (args: { id: string; startTime: number; trackId?: string }) => {
      if (args.trackId) {
        await z.mutate(
          mutators.clips.move({
            id: args.id,
            trackId: args.trackId,
            startTime: args.startTime,
          }),
        );
      } else {
        await z.mutate(
          mutators.clips.update({
            id: args.id,
            startTime: args.startTime,
          }),
        );
      }
    },
    [z],
  );

  const trimClip = useCallback(
    async (args: { id: string; startTime: number; audioStartTime: number; duration: number }) => {
      await z.mutate(mutators.clips.update(args)).client;
    },
    [z],
  );

  // Create clip mutation (used for alt+drag duplication)
  const createClip = useCallback(
    async (args: {
      id: string;
      projectId: string;
      trackId: string;
      audioFileId: string;
      name: string;
      startTime: number;
      duration: number;
      audioStartTime: number;
      gain: number;
    }) => {
      await z.mutate(mutators.clips.create(args));
    },
    [z],
  );

  // Clip drag
  const { clipDragState, handleDragStart, handleDragMove, handleDragEnd } = useKonvaClipDrag({
    tracks,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    sampleRate,
    updateClipPosition,
    selectedClipIds,
    clips,
    projectId,
    createClip,
  });

  // Clip trim
  const { trimState, handleTrimStart, handleTrimMove, handleTrimEnd } = useKonvaClipTrim({
    pixelsPerSecond,
    sampleRate,
    trimClip,
    getAudioFileDuration,
  });

  // Playhead animation
  const { playheadTimeRef } = useKonvaPlayheadAnimation({
    dynamicLayerRef,
    isPlaying,
    hoverXRef,
    hoverTimeRef,
  });

  // File drop — canvasRef used only for getBoundingClientRect, use container
  const {
    isDraggingFile,
    dropTarget,
    isUploading,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useTimelineFileDrop({
    canvasRef: containerRef as unknown as React.RefObject<HTMLCanvasElement | null>,
    containerRef,
    tracks: tracks.map((t) => ({
      ...t,
      order: 0,
      muted: false,
      solo: false,
      gain: 1,
    })),
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    sampleRate,
    projectId,
    rulerHeight: RULER_HEIGHT,
    trackHeight: TRACK_HEIGHT,
  });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry)
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Waveform fetching
  useEffect(() => {
    const fetchAll = async () => {
      for (const [audioFileId, storageKey] of Object.entries(waveformUrls)) {
        if (loadedWaveforms.has(audioFileId) || !storageKey) continue;
        const waveform = await fetchWaveform(audioFileId, storageKey, projectId);
        if (waveform) setLoadedWaveforms((prev) => new Map(prev).set(audioFileId, waveform));
      }
    };
    fetchAll();
  }, [waveformUrls, loadedWaveforms, projectId]);

  useEffect(() => {
    return () => clearWaveformCache();
  }, []);

  // Wheel handler (zoom + scroll)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const stage = staticLayerRef.current?.getStage();
      const stageContainer = stage?.container();
      if (stageContainer) {
        const rect = stageContainer.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const wheelEvent = {
          deltaY: e.deltaY,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        } as React.WheelEvent;
        if (handleWheelZoom(wheelEvent, cursorX)) return;
      }

      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setScrollLeft((prev) => Math.max(0, prev + delta));
      } else {
        const newScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + e.deltaY));
        onScrollChange(newScrollTop);
      }
    },
    [handleWheelZoom, setScrollLeft, maxScrollTop, scrollTop, onScrollChange],
  );

  // Clip click handler
  const handleClipClick = useCallback(
    (clipId: string, trackId: string, shiftKey: boolean) => {
      if (shiftKey) {
        onToggleClipSelection(clipId, trackId);
      } else {
        onSelectClip(clipId, trackId);
      }
    },
    [onSelectClip, onToggleClipSelection],
  );

  // Background click handler (seek + clear selection)
  const handleBackgroundClick = useCallback(
    (x: number) => {
      onClearSelection();
      const time = (x + scrollLeft) / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond, onSeek, onClearSelection],
  );

  // Mouse move on container for hover state
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      hoverXRef.current = canvasX;
      hoverTimeRef.current = Math.max(0, time);
    },
    [scrollLeft, pixelsPerSecond],
  );

  const handleMouseLeave = useCallback(() => {
    hoverXRef.current = null;
    hoverTimeRef.current = null;
  }, []);

  // Drop indicator
  const dropIndicatorStyle = dropTarget
    ? {
        left:
          (dropTarget.dropTimeInSamples / sampleRate - scrollLeft / pixelsPerSecond) *
          pixelsPerSecond,
        top: RULER_HEIGHT + dropTarget.trackIndex * TRACK_HEIGHT - scrollTop,
        height: TRACK_HEIGHT,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden"
      style={{ cursor: "crosshair" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <TimelineStage
        containerRef={containerRef}
        staticLayerRef={staticLayerRef}
        dynamicLayerRef={dynamicLayerRef}
        onContainerWheel={handleWheel}
        children={
          <StaticLayer
            width={dimensions.width}
            height={dimensions.height}
            tracks={tracks}
            clips={clips}
            sampleRate={sampleRate}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            pixelsPerSecond={pixelsPerSecond}
            selectedClipIds={selectedClipIds}
            clipDragState={clipDragState}
            trimState={trimState}
            dragOriginalTrackId={clipDragState?.originalTrackId ?? null}
            waveformCache={loadedWaveforms}
            onClipClick={handleClipClick}
            onBackgroundClick={handleBackgroundClick}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTrimStart={handleTrimStart}
            onTrimMove={handleTrimMove}
            onTrimEnd={handleTrimEnd}
          />
        }
        dynamicChildren={
          <DynamicLayer
            width={dimensions.width}
            height={dimensions.height}
            scrollLeft={scrollLeft}
            pixelsPerSecond={pixelsPerSecond}
            playheadTimeRef={playheadTimeRef}
            hoverXRef={hoverXRef}
            hoverTimeRef={hoverTimeRef}
          />
        }
      />

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-primary/10 ring-2 ring-inset ring-primary/50">
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-background/90 px-6 py-4 shadow-lg">
              <Upload className="size-8 text-primary" />
              <span className="text-sm font-medium">Drop audio file on a track</span>
            </div>
          </div>
        </div>
      )}

      {/* Drop target indicator */}
      {dropTarget && dropIndicatorStyle && (
        <div
          className="pointer-events-none absolute z-30 w-0.5 bg-primary"
          style={{
            left: dropIndicatorStyle.left,
            top: dropIndicatorStyle.top,
            height: dropIndicatorStyle.height,
          }}
        />
      )}

      {/* Upload loading overlay */}
      {isUploading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 shadow-lg">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Uploading audio...</span>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-0 top-0 z-10 flex h-6 items-center gap-0.5 border-b bg-background">
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" onClick={handleZoomOut} disabled={!canZoomOut}>
                <ZoomOut className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" onClick={handleZoomIn} disabled={!canZoomIn}>
                <ZoomIn className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
