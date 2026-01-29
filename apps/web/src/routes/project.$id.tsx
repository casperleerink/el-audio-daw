import { api } from "@el-audio-daw/backend/convex/_generated/api";
import type { Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";

import {
  ArrowLeft,
  Loader2,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { VirtualizedTrackList } from "@/components/VirtualizedTrackList";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useClipDrag, type ClipData } from "@/hooks/useClipDrag";
import { useOptimisticTrackUpdates } from "@/hooks/useOptimisticTrackUpdates";
import { useTimelineCanvasEvents } from "@/hooks/useTimelineCanvasEvents";
import { useTimelineFileDrop } from "@/hooks/useTimelineFileDrop";
import { useTimelineZoom } from "@/hooks/useTimelineZoom";
import { renderTimeline } from "@/lib/canvasRenderer";
import { formatGain, formatTime } from "@/lib/formatters";
import { CLIP_PADDING, RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
});

function ProjectEditorPage() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <>
      <Authenticated>
        <ProjectEditor />
      </Authenticated>
      <Unauthenticated>
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </Unauthenticated>
      <AuthLoading>
        <ProjectEditorSkeleton />
      </AuthLoading>
    </>
  );
}

function ProjectEditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header Skeleton */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="size-7 rounded-md" />
      </header>

      {/* Transport Controls Skeleton */}
      <div className="flex h-10 shrink-0 items-center gap-4 border-b bg-muted/30 px-4">
        <div className="flex items-center gap-1">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
        <Skeleton className="h-4 w-24" />
        <div className="ml-auto">
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Main Content Area Skeleton */}
      <div className="flex min-h-0 flex-1">
        {/* Track List Skeleton */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          {/* Spacer for timeline ruler */}
          <div className="h-6 shrink-0 border-b" />
          {/* Track Headers Skeleton */}
          <div className="flex-1 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="box-border h-[60px] border-b p-2">
                <div className="mb-1 flex items-center gap-1">
                  <Skeleton className="size-3" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="size-5 rounded-md" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-6 w-7 rounded-md" />
                  <Skeleton className="h-6 w-7 rounded-md" />
                  <Skeleton className="mx-1 h-2 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
          {/* Master Track Skeleton */}
          <div className="shrink-0 border-t bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>

        {/* Timeline Area Skeleton */}
        <div className="flex flex-1 flex-col">
          <div className="h-full w-full">
            {/* Ruler Skeleton */}
            <div className="flex h-6 items-end border-b">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex-1 px-4">
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
            {/* Track Lanes Skeleton */}
            <div className="flex-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[60px] border-b" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const project = useQuery(api.projects.getProject, { id: id as any });
  const tracks = useQuery(api.tracks.getProjectTracks, { projectId: id as any });
  const clips = useQuery(api.clips.getProjectClips, { projectId: id as any });
  const clipUrls = useQuery(api.clips.getProjectClipUrls, { projectId: id as any });

  const createTrack = useMutation(api.tracks.createTrack);
  const updateTrack = useMutation(api.tracks.updateTrack);
  const deleteTrack = useMutation(api.tracks.deleteTrack);
  const reorderTracks = useMutation(api.tracks.reorderTracks);
  const updateProject = useMutation(api.projects.updateProject);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);

  const trackListRef = useRef<HTMLDivElement>(null);

  const {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
  } = useOptimisticTrackUpdates(tracks, updateTrack);

  const {
    isEngineInitializing,
    isPlaying,
    playheadTime,
    masterGain,
    setMasterGain,
    stop: handleStop,
    togglePlayStop: handleTogglePlayStop,
    seek,
  } = useAudioEngine({
    sampleRate: project?.sampleRate ?? 44100,
    tracks: tracksWithOptimisticUpdates,
    clips,
    clipUrls,
  });

  // Update project name when project loads
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handleAddTrack = useCallback(async () => {
    setIsAddingTrack(true);
    try {
      await createTrack({ projectId: id as any });
      toast.success("Track added");
    } catch {
      toast.error("Failed to create track");
    } finally {
      setIsAddingTrack(false);
    }
  }, [createTrack, id]);

  const handleUpdateTrackName = useCallback(
    async (trackId: string, name: string) => {
      try {
        await updateTrack({ id: trackId as any, name });
      } catch {
        toast.error("Failed to update track");
      }
    },
    [updateTrack],
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      setDeletingTrackId(trackId);
      try {
        await deleteTrack({ id: trackId as any });
        toast.success("Track deleted");
      } catch {
        toast.error("Failed to delete track");
      } finally {
        setDeletingTrackId(null);
      }
    },
    [deleteTrack],
  );

  const handleReorderTracks = useCallback(
    async (trackIds: string[]) => {
      try {
        await reorderTracks({ projectId: id as any, trackIds: trackIds as any });
      } catch {
        toast.error("Failed to reorder tracks");
      }
    },
    [reorderTracks, id],
  );

  const handleSaveProjectName = useCallback(async () => {
    if (!project || projectName === project.name) {
      setSettingsOpen(false);
      return;
    }

    setIsSavingProjectName(true);
    try {
      await updateProject({ id: id as any, name: projectName });
      toast.success("Project renamed");
      setSettingsOpen(false);
    } catch {
      toast.error("Failed to rename project");
    } finally {
      setIsSavingProjectName(false);
    }
  }, [updateProject, id, projectName, project]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar: toggle play/stop
      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlayStop();
      }

      // Cmd+T / Ctrl+T: add track
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyT") {
        e.preventDefault();
        handleAddTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePlayStop, handleAddTrack]);

  // Loading state
  if (project === undefined || tracks === undefined) {
    return <ProjectEditorSkeleton />;
  }

  // Project not found or no access
  if (project === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft className="size-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate({ to: "/" })}>
            <ArrowLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">{project.name}</span>
        </div>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
            <Settings className="size-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Project Settings</DialogTitle>
              <DialogDescription>Update your project settings</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                maxLength={50}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveProjectName();
                  }
                }}
              />
              {projectName.length >= 40 && (
                <p
                  className={`text-xs ${projectName.length >= 50 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {projectName.length}/50 characters
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleSaveProjectName} disabled={isSavingProjectName}>
                {isSavingProjectName ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Transport Controls */}
      <div className="flex h-10 shrink-0 items-center gap-4 border-b bg-muted/30 px-4">
        <div className="flex items-center gap-1">
          <Tooltip delay={500}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleTogglePlayStop}
                  disabled={isEngineInitializing}
                >
                  {isEngineInitializing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>
              }
            />
            <TooltipContent>
              {isPlaying ? "Pause" : "Play"} <Kbd>Space</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip delay={500}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleStop}
                  disabled={isEngineInitializing}
                >
                  <Square className="size-3" />
                </Button>
              }
            />
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        </div>

        <div className="font-mono text-sm tabular-nums">{formatTime(playheadTime)}</div>

        <div className="ml-auto flex items-center gap-2">
          <Tooltip delay={500}>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddTrack}
                  disabled={isAddingTrack}
                >
                  {isAddingTrack ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add Track
                </Button>
              }
            />
            <TooltipContent>
              Add Track <Kbd>⌘</Kbd>
              <Kbd>T</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1">
        {/* Track List */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          {/* Spacer to align with timeline ruler */}
          <div className="h-6 shrink-0 border-b" />
          {/* Track Headers */}
          <VirtualizedTrackList
            ref={trackListRef}
            tracks={tracksWithOptimisticUpdates ?? []}
            scrollTop={scrollTop}
            onScrollChange={setScrollTop}
            onMuteChange={handleUpdateTrackMute}
            onSoloChange={handleUpdateTrackSolo}
            onGainChange={handleUpdateTrackGain}
            onNameChange={handleUpdateTrackName}
            onDelete={handleDeleteTrack}
            onReorder={handleReorderTracks}
            deletingTrackId={deletingTrackId}
            onAddTrack={handleAddTrack}
            isAddingTrack={isAddingTrack}
          />

          {/* Master Track */}
          <div className="shrink-0 border-t bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium">Master</span>
              <Slider
                className="flex-1"
                min={-60}
                max={12}
                step={0.1}
                value={[masterGain]}
                onValueChange={(val) => setMasterGain(Array.isArray(val) ? (val[0] ?? 0) : val)}
              />
              <span className="w-16 text-right font-mono text-xs">{formatGain(masterGain)}</span>
            </div>
          </div>
        </div>

        {/* Timeline Area */}
        <div className="flex flex-1 flex-col">
          <TimelineCanvas
            tracks={tracks}
            clips={(clips ?? []).map((clip) => ({
              _id: clip._id,
              trackId: clip.trackId,
              fileId: clip.fileId,
              name: clip.name,
              startTime: clip.startTime,
              duration: clip.duration,
            }))}
            sampleRate={project?.sampleRate ?? 44100}
            playheadTime={playheadTime}
            scrollTop={scrollTop}
            onScrollChange={setScrollTop}
            onSeek={seek}
            projectId={id as Id<"projects">}
          />
        </div>
      </div>
    </div>
  );
}

interface TimelineCanvasProps {
  tracks: { _id: string; name: string }[];
  clips: ClipData[];
  sampleRate: number;
  playheadTime: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
  projectId: Id<"projects">;
}

function TimelineCanvas({
  tracks,
  clips,
  sampleRate,
  playheadTime,
  scrollTop,
  onScrollChange,
  onSeek,
  projectId,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

  // Mutation for clip position update
  const updateClipPosition = useMutation(api.clips.updateClipPosition);

  // Clip drag state and handlers (FR-34-38)
  const {
    clipDragState,
    justFinishedDrag,
    findClipAtPosition,
    handleMouseDown: handleClipMouseDown,
    handleMouseMove: handleClipMouseMove,
    handleMouseUp: handleClipMouseUp,
    handleMouseLeave: handleClipMouseLeave,
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
    updateClipPosition,
  });

  // Canvas event handlers (wheel, click, hover)
  const { hoverX, hoverTime, handleWheel, handleClick, handleMouseMove, handleMouseLeave } =
    useTimelineCanvasEvents({
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
      _id: t._id as Id<"tracks">,
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

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderTimeline({
      canvas,
      dimensions,
      tracks,
      clips,
      sampleRate,
      playheadTime,
      scrollLeft,
      scrollTop,
      pixelsPerSecond,
      hoverX,
      clipDragState: clipDragState
        ? { clipId: clipDragState.clipId, currentStartTime: clipDragState.currentStartTime }
        : null,
      rulerHeight: RULER_HEIGHT,
      trackHeight: TRACK_HEIGHT,
    });
  }, [
    dimensions,
    tracks,
    clips,
    sampleRate,
    playheadTime,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    hoverX,
    clipDragState,
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
      onWheel={handleWheel}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${clipDragState ? "cursor-grabbing" : "cursor-crosshair"}`}
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
      <div className="absolute right-2 top-0.5 z-10 flex items-center gap-0.5">
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
