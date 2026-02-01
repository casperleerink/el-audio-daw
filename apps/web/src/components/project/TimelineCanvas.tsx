import { Loader2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useZero } from "@rocicorp/zero/react";

import { useClipDrag, type ClipData } from "@/hooks/useClipDrag";
import { useClipMouseHandlers } from "@/hooks/useClipMouseHandlers";
import { useClipTrim } from "@/hooks/useClipTrim";
import { useTimelineCanvasEvents } from "@/hooks/useTimelineCanvasEvents";
import { useTimelineFileDrop } from "@/hooks/useTimelineFileDrop";
import { useTimelineZoom } from "@/hooks/useTimelineZoom";
import { renderTimeline } from "@/lib/canvasRenderer";
import { fetchWaveform, clearWaveformCache, type WaveformData } from "@/lib/waveformCache";
import { formatTime } from "@/lib/formatters";
import { CLIP_PADDING, RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mutators } from "@el-audio-daw/zero/mutators";

export interface TimelineCanvasProps {
  tracks: { _id: string; name: string }[];
  clips: ClipData[];
  sampleRate: number;
  playheadTime: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
  projectId: string;
  selectedClipIds: Set<string>;
  onSelectClip: (clipId: string, trackId: string) => void;
  onToggleClipSelection: (clipId: string, trackId: string) => void;
  onClearSelection: () => void;
  /** Lookup function for audio file duration (for trim constraints) */
  getAudioFileDuration: (audioFileId: string) => number | undefined;
  /** Waveform URLs keyed by audioFileId */
  waveformUrls: Record<string, string | null>;
}

export function TimelineCanvas({
  tracks,
  clips,
  sampleRate,
  playheadTime,
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
}: TimelineCanvasProps) {
  const z = useZero();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Waveform cache state (triggers re-render when waveforms load)
  const [loadedWaveforms, setLoadedWaveforms] = useState<Map<string, WaveformData>>(new Map());

  // Animation time for shimmer effect (only updates when clips are loading)
  const [animationTime, setAnimationTime] = useState(0);

  // Calculate max vertical scroll (needed by hooks)
  const totalTrackHeight = tracks.length * TRACK_HEIGHT;
  const viewportHeight = dimensions.height - RULER_HEIGHT;
  const maxScrollTop = Math.max(0, totalTrackHeight - viewportHeight);

  // Zoom state and handlers
  const {
    scrollLeft,
    pixelsPerSecond,
    setScrollLeft,
    canZoomIn,
    canZoomOut,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoom,
  } = useTimelineZoom({
    containerRef,
    canvasRef,
    hoverX: null, // Will be updated by useTimelineCanvasEvents
    dimensions,
  });

  // Zero mutation wrapper for clip position update
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

  // Zero mutation wrapper for clip trim
  const trimClip = useCallback(
    async (args: { id: string; startTime: number; audioStartTime: number; duration: number }) => {
      await z.mutate(
        mutators.clips.update({
          id: args.id,
          startTime: args.startTime,
          audioStartTime: args.audioStartTime,
          duration: args.duration,
        }),
      );
    },
    [z],
  );

  // Clip drag state and handlers (FR-34-38)
  const {
    clipDragState,
    justFinishedDrag: justFinishedMoveDrag,
    findClipAtPosition,
    handleMouseDown: handleDragMouseDown,
    handleMouseMove: handleDragMouseMove,
    handleMouseUp: handleDragMouseUp,
    handleMouseLeave: handleDragMouseLeave,
  } = useClipDrag({
    canvasRef,
    tracks,
    clips,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    sampleRate,
    layoutParams: {
      rulerHeight: RULER_HEIGHT,
      trackHeight: TRACK_HEIGHT,
      clipPadding: CLIP_PADDING,
    },
    projectId,
    updateClipPosition,
  });

  // Clip trim state and handlers (FR-16-22)
  const {
    trimDragState,
    justFinishedTrimDrag,
    handleTrimMouseDown,
    handleTrimMouseMove,
    handleTrimMouseUp,
    handleTrimMouseLeave,
  } = useClipTrim({
    pixelsPerSecond,
    sampleRate,
    projectId,
    findClipAtPosition,
    trimClip,
    getAudioFileDuration,
  });

  // Coordinate clip mouse handlers (trim and drag)
  const {
    handleClipMouseDown,
    handleClipMouseMove,
    handleClipMouseUp,
    handleClipMouseLeave,
    justFinishedDrag,
  } = useClipMouseHandlers({
    handleTrimMouseDown,
    handleTrimMouseMove,
    handleTrimMouseUp,
    handleTrimMouseLeave,
    handleDragMouseDown,
    handleDragMouseMove,
    handleDragMouseUp,
    handleDragMouseLeave,
    justFinishedTrimDrag,
    justFinishedMoveDrag,
  });

  // Canvas event handlers (wheel, click, hover, trim handle detection)
  const {
    hoverX,
    hoverTime,
    hoveredClipId,
    hoveredClipZone,
    handleClick,
    handleMouseMove,
    handleMouseLeave,
  } = useTimelineCanvasEvents({
    containerRef,
    canvasRef,
    scrollLeft,
    scrollTop,
    setScrollLeft,
    maxScrollTop,
    pixelsPerSecond,
    onScrollChange,
    onSeek,
    handleWheelZoom,
    findClipAtPosition,
    justFinishedDrag,
    handleClipMouseMove,
    handleClipMouseLeave,
    onSelectClip,
    onToggleClipSelection,
    onClearSelection,
  });

  // File drag-drop state and handlers (FR-29-33)
  const {
    isDraggingFile,
    dropTarget,
    isUploading,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useTimelineFileDrop({
    canvasRef,
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

  // Track resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fetch waveforms when URLs become available
  useEffect(() => {
    const fetchAllWaveforms = async () => {
      const entries = Object.entries(waveformUrls);

      for (const [audioFileId, url] of entries) {
        // Skip if already loaded or no URL
        if (loadedWaveforms.has(audioFileId) || !url) continue;

        const waveform = await fetchWaveform(audioFileId, url);
        if (waveform) {
          setLoadedWaveforms((prev) => new Map(prev).set(audioFileId, waveform));
        }
      }
    };

    fetchAllWaveforms();
  }, [waveformUrls, loadedWaveforms]);

  // Clear cache when unmounting
  useEffect(() => {
    return () => clearWaveformCache();
  }, []);

  // Animation loop for waveform loading shimmer
  useEffect(() => {
    // Check if any clips are missing waveforms
    const hasMissingWaveforms = clips.some(
      (clip) =>
        !loadedWaveforms.has(clip.audioFileId) && waveformUrls[clip.audioFileId] !== undefined,
    );

    if (!hasMissingWaveforms) return;

    let animationId: number;
    const animate = () => {
      setAnimationTime(Date.now());
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [clips, loadedWaveforms, waveformUrls]);

  // Transform clips to include selection and hover state for rendering
  const clipsWithState = clips.map((clip) => ({
    ...clip,
    selected: selectedClipIds.has(clip._id),
    // FR-14: Include hover zone for trim handle rendering
    hoverZone: clip._id === hoveredClipId ? hoveredClipZone : null,
  }));

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderTimeline({
      canvas,
      dimensions,
      tracks,
      clips: clipsWithState,
      sampleRate,
      playheadTime,
      scrollLeft,
      scrollTop,
      pixelsPerSecond,
      hoverX,
      clipDragState: clipDragState
        ? {
            clipId: clipDragState.clipId,
            currentStartTime: clipDragState.currentStartTime,
            currentTrackId: clipDragState.currentTrackId,
          }
        : null,
      trimDragState: trimDragState
        ? {
            clipId: trimDragState.clipId,
            currentStartTime: trimDragState.currentStartTime,
            currentDuration: trimDragState.currentDuration,
          }
        : null,
      rulerHeight: RULER_HEIGHT,
      trackHeight: TRACK_HEIGHT,
      dragOriginalTrackId: clipDragState?.originalTrackId,
      waveformCache: loadedWaveforms,
      animationTime,
    });
  }, [
    dimensions,
    tracks,
    clipsWithState,
    sampleRate,
    playheadTime,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    hoverX,
    clipDragState,
    trimDragState,
    hoveredClipId,
    hoveredClipZone,
    loadedWaveforms,
    animationTime,
  ]);

  // Calculate drop indicator position (FR-30)
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
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${
          clipDragState
            ? "cursor-grabbing"
            : hoveredClipZone === "left" || hoveredClipZone === "right"
              ? "cursor-ew-resize"
              : "cursor-crosshair"
        }`}
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseDown={handleClipMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleClipMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Drop zone overlay (FR-30) */}
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

      {/* Drop target indicator (FR-30) */}
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

      {/* Upload loading overlay (FR-32) */}
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
      {/* Hover time tooltip */}
      {hoverX !== null && hoverTime !== null && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: hoverX,
            top: RULER_HEIGHT + 4,
            transform: hoverX > dimensions.width - 60 ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          <div className="bg-foreground text-background rounded px-1.5 py-0.5 text-xs font-mono whitespace-nowrap">
            {formatTime(hoverTime, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
