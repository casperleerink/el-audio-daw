import { api } from "@el-audio-daw/backend/convex/_generated/api";
import type { Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import { AudioEngine, type ClipState, type TrackState } from "@el-audio-daw/audio";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";

// Safari-specific GestureEvent for trackpad pinch-to-zoom
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface GestureEvent extends UIEvent {
  scale: number;
  rotation: number;
}
import {
  ArrowLeft,
  GripVertical,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Settings,
  Square,
  Trash2,
  Upload,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
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
import { Toggle } from "@/components/ui/toggle";
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

  const [isEngineInitializing, setIsEngineInitializing] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [masterGain, setMasterGain] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);

  // Optimistic updates for track controls
  // Map of trackId -> { muted?, solo?, gain? }
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Map<string, { muted?: boolean; solo?: boolean; gain?: number }>
  >(new Map());

  const engineRef = useRef<AudioEngine | null>(null);
  const trackListRef = useRef<HTMLDivElement>(null);

  // Merge server tracks with optimistic updates
  const tracksWithOptimisticUpdates = React.useMemo(() => {
    if (!tracks) return undefined;
    return tracks.map((track) => {
      const optimistic = optimisticUpdates.get(track._id);
      if (!optimistic) return track;
      return {
        ...track,
        muted: optimistic.muted ?? track.muted,
        solo: optimistic.solo ?? track.solo,
        gain: optimistic.gain ?? track.gain,
      };
    });
  }, [tracks, optimisticUpdates]);

  // Initialize audio engine (called lazily on first transport action)
  const initializeEngine = useCallback(async () => {
    if (engineRef.current?.isInitialized()) {
      return engineRef.current;
    }

    setIsEngineInitializing(true);
    try {
      const engine = new AudioEngine();
      await engine.initialize();
      engineRef.current = engine;

      engine.onPlayheadUpdate((time: number) => {
        setPlayheadTime(time);
      });

      setIsEngineReady(true);
      return engine;
    } catch (err) {
      toast.error("Failed to initialize audio engine. Please try again.");
      console.error(err);
      return null;
    } finally {
      setIsEngineInitializing(false);
    }
  }, []);

  // Sync tracks to audio engine (uses optimistic updates for instant feedback)
  useEffect(() => {
    if (!engineRef.current || !tracksWithOptimisticUpdates) return;

    const trackStates: TrackState[] = tracksWithOptimisticUpdates.map((t) => ({
      id: t._id,
      muted: t.muted,
      solo: t.solo,
      gain: t.gain,
    }));

    engineRef.current.setTracks(trackStates);
  }, [tracksWithOptimisticUpdates]);

  // Sync master gain to audio engine
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.setMasterGain(masterGain);
  }, [masterGain]);

  // Load clips into VFS and sync to audio engine (FR-17)
  useEffect(() => {
    const engine = engineRef.current;
    if (!isEngineReady || !engine?.isInitialized() || !clips || !clipUrls) return;

    // Build a map of fileId -> URL for quick lookup
    const urlMap = new Map<string, string>();
    for (const clipUrl of clipUrls) {
      if (clipUrl.url) {
        urlMap.set(clipUrl.fileId, clipUrl.url);
      }
    }

    // Load all audio into VFS (only loads if not already loaded)
    const loadPromises = clips.map(async (clip) => {
      const url = urlMap.get(clip.fileId);
      if (!url) return;

      try {
        // This is idempotent - it won't reload if already in VFS
        await engine.loadAudioIntoVFS(clip.fileId, url);
      } catch (err) {
        console.error(`Failed to load audio for clip ${clip.name}:`, err);
      }
    });

    // After loading, sync clip state to engine for playback
    Promise.all(loadPromises).then(() => {
      const clipStates: ClipState[] = clips.map((clip) => ({
        id: clip._id,
        trackId: clip.trackId,
        fileId: clip.fileId,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain,
      }));
      engine.setClips(clipStates);
    });
  }, [isEngineReady, clips, clipUrls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  // Update project name when project loads
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handlePlay = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      engine = await initializeEngine();
      if (!engine) return;
    }
    engine.play();
    setIsPlaying(true);
  }, [initializeEngine]);

  const handleStop = useCallback(() => {
    if (!isPlaying) {
      // Already stopped, reset playhead to 0
      engineRef.current?.setPlayhead(0);
      setPlayheadTime(0);
      return;
    }
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
  }, [isPlaying]);

  const handleTogglePlayStop = useCallback(async () => {
    if (isPlaying) {
      handleStop();
    } else {
      await handlePlay();
    }
  }, [isPlaying, handlePlay, handleStop]);

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

  // Helper to apply optimistic update and rollback on failure
  const applyOptimisticUpdate = useCallback(
    (trackId: string, update: { muted?: boolean; solo?: boolean; gain?: number }) => {
      setOptimisticUpdates((prev) => {
        const next = new Map(prev);
        const existing = next.get(trackId) || {};
        next.set(trackId, { ...existing, ...update });
        return next;
      });
    },
    [],
  );

  const clearOptimisticUpdate = useCallback(
    (trackId: string, keys: ("muted" | "solo" | "gain")[]) => {
      setOptimisticUpdates((prev) => {
        const next = new Map(prev);
        const existing = next.get(trackId);
        if (!existing) return prev;

        const updated = { ...existing };
        for (const key of keys) {
          delete updated[key];
        }

        if (Object.keys(updated).length === 0) {
          next.delete(trackId);
        } else {
          next.set(trackId, updated);
        }
        return next;
      });
    },
    [],
  );

  const handleUpdateTrackMute = useCallback(
    async (trackId: string, muted: boolean) => {
      // Apply optimistic update immediately
      applyOptimisticUpdate(trackId, { muted });

      try {
        await updateTrack({ id: trackId as any, muted });
        // Clear optimistic update on success (server data will match)
        clearOptimisticUpdate(trackId, ["muted"]);
      } catch {
        // Rollback optimistic update on failure
        clearOptimisticUpdate(trackId, ["muted"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  const handleUpdateTrackSolo = useCallback(
    async (trackId: string, solo: boolean) => {
      // Apply optimistic update immediately
      applyOptimisticUpdate(trackId, { solo });

      try {
        await updateTrack({ id: trackId as any, solo });
        // Clear optimistic update on success
        clearOptimisticUpdate(trackId, ["solo"]);
      } catch {
        // Rollback optimistic update on failure
        clearOptimisticUpdate(trackId, ["solo"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

  const handleUpdateTrackGain = useCallback(
    async (trackId: string, gain: number) => {
      // Apply optimistic update immediately
      applyOptimisticUpdate(trackId, { gain });

      try {
        await updateTrack({ id: trackId as any, gain });
        // Clear optimistic update on success
        clearOptimisticUpdate(trackId, ["gain"]);
      } catch {
        // Rollback optimistic update on failure
        clearOptimisticUpdate(trackId, ["gain"]);
        toast.error("Failed to update track");
      }
    },
    [updateTrack, applyOptimisticUpdate, clearOptimisticUpdate],
  );

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

  // Format time as M:SS.mmm
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }, []);

  // Format gain as dB
  const formatGain = useCallback((db: number) => {
    if (db <= -60) return "-∞";
    return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
  }, []);

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
            formatGain={formatGain}
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
            onSeek={async (time) => {
              let engine = engineRef.current;
              if (!engine) {
                engine = await initializeEngine();
              }
              engine?.setPlayhead(time);
              setPlayheadTime(time);
            }}
            projectId={id as Id<"projects">}
          />
        </div>
      </div>
    </div>
  );
}

const TRACK_HEADER_HEIGHT = 60;

interface VirtualizedTrackListProps {
  tracks: {
    _id: string;
    name: string;
    muted: boolean;
    solo: boolean;
    gain: number;
  }[];
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onMuteChange: (trackId: string, muted: boolean) => void;
  onSoloChange: (trackId: string, solo: boolean) => void;
  onGainChange: (trackId: string, gain: number) => void;
  onNameChange: (trackId: string, name: string) => void;
  onDelete: (trackId: string) => void;
  onReorder: (trackIds: string[]) => void;
  formatGain: (db: number) => string;
  deletingTrackId: string | null;
  onAddTrack: () => void;
  isAddingTrack: boolean;
}

const VirtualizedTrackList = React.forwardRef<HTMLDivElement, VirtualizedTrackListProps>(
  function VirtualizedTrackList(
    {
      tracks,
      scrollTop,
      onScrollChange,
      onMuteChange,
      onSoloChange,
      onGainChange,
      onNameChange,
      onDelete,
      onReorder,
      formatGain,
      deletingTrackId,
      onAddTrack,
      isAddingTrack,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null);
    const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    // Sync scroll position from parent
    useEffect(() => {
      if (parentRef.current && Math.abs(parentRef.current.scrollTop - scrollTop) > 1) {
        parentRef.current.scrollTop = scrollTop;
      }
    }, [scrollTop]);

    const virtualizer = useVirtualizer({
      count: tracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => TRACK_HEADER_HEIGHT,
      overscan: 5,
    });

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        onScrollChange(e.currentTarget.scrollTop);
      },
      [onScrollChange],
    );

    const handleDragStart = useCallback((e: React.DragEvent, trackId: string) => {
      setDraggedTrackId(trackId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", trackId);
    }, []);

    const handleDragEnd = useCallback(() => {
      setDraggedTrackId(null);
      setDropTargetIndex(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Calculate if we're in the top or bottom half of the track
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const insertIndex = e.clientY < midpoint ? index : index + 1;

      setDropTargetIndex(insertIndex);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();

        if (draggedTrackId === null || dropTargetIndex === null) return;

        const draggedIndex = tracks.findIndex((t) => t._id === draggedTrackId);
        if (draggedIndex === -1) return;

        // Don't do anything if dropping in the same position
        if (dropTargetIndex === draggedIndex || dropTargetIndex === draggedIndex + 1) {
          setDraggedTrackId(null);
          setDropTargetIndex(null);
          return;
        }

        // Build new order of track IDs
        const newTrackIds = tracks.map((t) => t._id);
        const [removed] = newTrackIds.splice(draggedIndex, 1);
        if (!removed) return;

        // Adjust target index if we removed an item before it
        const adjustedIndex =
          dropTargetIndex > draggedIndex ? dropTargetIndex - 1 : dropTargetIndex;
        newTrackIds.splice(adjustedIndex, 0, removed);

        onReorder(newTrackIds);
        setDraggedTrackId(null);
        setDropTargetIndex(null);
      },
      [draggedTrackId, dropTargetIndex, tracks, onReorder],
    );

    // Forward ref
    React.useImperativeHandle(ref, () => parentRef.current as HTMLDivElement, []);

    if (tracks.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <p className="text-sm text-muted-foreground">No tracks yet</p>
          <Button onClick={onAddTrack} disabled={isAddingTrack}>
            {isAddingTrack ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add Track
          </Button>
        </div>
      );
    }

    return (
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index];
            if (!track) return null;

            const isDragging = track._id === draggedTrackId;
            const showDropIndicatorBefore = dropTargetIndex === virtualRow.index;
            const showDropIndicatorAfter =
              dropTargetIndex === virtualRow.index + 1 && virtualRow.index === tracks.length - 1;

            return (
              <div
                key={track._id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onDragOver={(e) => handleDragOver(e, virtualRow.index)}
              >
                {showDropIndicatorBefore && (
                  <div className="pointer-events-none absolute inset-0 rounded bg-primary/10 ring-2 ring-inset ring-primary/50" />
                )}
                <TrackHeader
                  track={track}
                  isDragging={isDragging}
                  isDeleting={deletingTrackId === track._id}
                  onDragStart={(e) => handleDragStart(e, track._id)}
                  onDragEnd={handleDragEnd}
                  onMuteChange={(muted) => onMuteChange(track._id, muted)}
                  onSoloChange={(solo) => onSoloChange(track._id, solo)}
                  onGainChange={(gain) => onGainChange(track._id, gain)}
                  onNameChange={(name) => onNameChange(track._id, name)}
                  onDelete={() => onDelete(track._id)}
                  formatGain={formatGain}
                />
                {showDropIndicatorAfter && (
                  <div className="pointer-events-none absolute inset-0 rounded bg-primary/10 ring-2 ring-inset ring-primary/50" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

interface TrackHeaderProps {
  track: {
    _id: string;
    name: string;
    muted: boolean;
    solo: boolean;
    gain: number;
  };
  isDragging?: boolean;
  isDeleting?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMuteChange: (muted: boolean) => void;
  onSoloChange: (solo: boolean) => void;
  onGainChange: (gain: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  formatGain: (db: number) => string;
}

function TrackHeader({
  track,
  isDragging,
  isDeleting,
  onDragStart,
  onDragEnd,
  onMuteChange,
  onSoloChange,
  onGainChange,
  onNameChange,
  onDelete,
  formatGain,
}: TrackHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== track.name) {
      onNameChange(trimmed);
    } else {
      setEditName(track.name);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`box-border h-[60px] border-b p-2 transition-all duration-150 ${isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Track Name Row */}
      <div className="mb-1 flex items-center gap-1">
        <div
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-3" />
        </div>
        {isEditing ? (
          <div className="flex flex-1 items-center gap-1">
            <Input
              ref={inputRef}
              className="h-6 flex-1 border-ring text-xs ring-1 ring-ring/50"
              value={editName}
              maxLength={50}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSubmit();
                if (e.key === "Escape") {
                  setEditName(track.name);
                  setIsEditing(false);
                }
              }}
            />
            {editName.length >= 40 && (
              <span
                className={`shrink-0 text-[10px] ${editName.length >= 50 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {editName.length}/50
              </span>
            )}
          </div>
        ) : (
          <button
            className="group flex flex-1 items-center gap-1 truncate text-left text-xs font-medium hover:text-foreground/80"
            onClick={() => setIsEditing(true)}
          >
            <span className="truncate">{track.name}</span>
            <Pencil className="size-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </Button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={track.muted}
          onPressedChange={onMuteChange}
          className="h-6 w-7 px-0 data-[state=on]:bg-yellow-500/20 data-[state=on]:text-yellow-600"
        >
          {track.muted ? (
            <VolumeX className="size-3" />
          ) : (
            <span className="text-[10px] font-semibold">M</span>
          )}
        </Toggle>
        <Toggle
          size="sm"
          pressed={track.solo}
          onPressedChange={onSoloChange}
          className="h-6 w-7 px-0 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-600"
        >
          <span className="text-[10px] font-semibold">S</span>
        </Toggle>
        <Slider
          className="mx-1 flex-1"
          min={-60}
          max={12}
          step={0.1}
          value={[track.gain]}
          onValueChange={(val) => onGainChange(Array.isArray(val) ? (val[0] ?? 0) : val)}
        />
        <span className="w-12 text-right font-mono text-[10px] text-muted-foreground">
          {formatGain(track.gain)}
        </span>
      </div>
    </div>
  );
}

// Clip data from Convex query
interface ClipData {
  _id: string;
  trackId: string;
  fileId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
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

const TRACK_HEIGHT = 60;
const RULER_HEIGHT = 24;
const DEFAULT_PIXELS_PER_SECOND = 20;
const MIN_PIXELS_PER_SECOND = 2;
const MAX_PIXELS_PER_SECOND = 200;

// Generate a track color from its index using HSL
// Uses a golden angle offset to spread colors evenly around the hue wheel
function getTrackColor(index: number): string {
  const goldenAngle = 137.508; // degrees
  const hue = (index * goldenAngle) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

// Supported audio MIME types for client-side validation (matches backend)
const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/x-aiff",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/vorbis",
];

// Maximum file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Drop target state for visual feedback
interface DropTarget {
  trackId: string;
  trackIndex: number;
  dropTimeInSamples: number;
}

// Clip drag state for moving clips (FR-34-38)
interface ClipDragState {
  clipId: string;
  originalStartTime: number; // in samples
  currentStartTime: number; // in samples (updated during drag)
  dragStartX: number; // initial mouse X position
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
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  // Hover state for timeline cursor indicator
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Drag-drop state (FR-29-33)
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Clip drag state (FR-34-38)
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  // Mutations for file upload
  const generateUploadUrl = useMutation(api.clips.generateUploadUrl);
  const validateUploadedFile = useMutation(api.clips.validateUploadedFile);
  const createClip = useMutation(api.clips.createClip);
  const updateClipPosition = useMutation(api.clips.updateClipPosition);

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

  // Calculate max vertical scroll
  const totalTrackHeight = tracks.length * TRACK_HEIGHT;
  const viewportHeight = dimensions.height - RULER_HEIGHT;
  const maxScrollTop = Math.max(0, totalTrackHeight - viewportHeight);

  // Find clip at mouse position (for drag-to-move)
  const findClipAtPosition = useCallback(
    (clientX: number, clientY: number): ClipData | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || tracks.length === 0) return null;

      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;

      // Check if in track area (below ruler)
      if (canvasY < RULER_HEIGHT) return null;

      // Calculate track index from Y position
      const trackIndex = Math.floor((canvasY - RULER_HEIGHT + scrollTop) / TRACK_HEIGHT);
      if (trackIndex < 0 || trackIndex >= tracks.length) return null;

      const track = tracks[trackIndex];
      if (!track) return null;

      // Calculate time from X position (in seconds for comparison)
      const timeInSeconds = (canvasX + scrollLeft) / pixelsPerSecond;

      // Clip dimensions constants (must match canvas drawing code)
      const CLIP_PADDING = 2;

      // Find a clip at this position
      for (const clip of clips) {
        if (clip.trackId !== track._id) continue;

        const clipStartSeconds = clip.startTime / sampleRate;
        const clipDurationSeconds = clip.duration / sampleRate;
        const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

        // Check if click is within clip's time range
        if (timeInSeconds >= clipStartSeconds && timeInSeconds <= clipEndSeconds) {
          // Check if click is within clip's vertical bounds
          const trackY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop;
          const clipY = trackY + CLIP_PADDING;
          const clipHeight = TRACK_HEIGHT - CLIP_PADDING * 2 - 1;

          if (canvasY >= clipY && canvasY <= clipY + clipHeight) {
            return clip;
          }
        }
      }

      return null;
    },
    [tracks, clips, scrollLeft, scrollTop, pixelsPerSecond, sampleRate],
  );

  // Calculate drop position from mouse coordinates (FR-31)
  const calculateDropPosition = useCallback(
    (clientX: number, clientY: number): DropTarget | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || tracks.length === 0) return null;

      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;

      // Check if in track area (below ruler)
      if (canvasY < RULER_HEIGHT) return null;

      // Calculate track index from Y position
      const trackIndex = Math.floor((canvasY - RULER_HEIGHT + scrollTop) / TRACK_HEIGHT);
      if (trackIndex < 0 || trackIndex >= tracks.length) return null;

      const track = tracks[trackIndex];
      if (!track) return null;

      // Calculate time from X position (FR-31)
      const timeInSeconds = (canvasX + scrollLeft) / pixelsPerSecond;
      const dropTimeInSamples = Math.max(0, Math.round(timeInSeconds * sampleRate));

      return {
        trackId: track._id,
        trackIndex,
        dropTimeInSamples,
      };
    },
    [tracks, scrollLeft, scrollTop, pixelsPerSecond, sampleRate],
  );

  // Check if file is a supported audio type
  const isAudioFile = useCallback((file: File): boolean => {
    return SUPPORTED_AUDIO_TYPES.includes(file.type);
  }, []);

  // Decode audio file to get duration (FR-10)
  const decodeAudioFile = useCallback(
    async (file: File): Promise<{ durationInSamples: number; fileSampleRate: number }> => {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate });
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return {
          durationInSamples: audioBuffer.length,
          fileSampleRate: audioBuffer.sampleRate,
        };
      } finally {
        await audioContext.close();
      }
    },
    [sampleRate],
  );

  // Handle file drop (FR-29-33)
  const handleFileDrop = useCallback(
    async (file: File, dropPosition: DropTarget) => {
      // Client-side validation (FR-6, FR-7)
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `File too large. Maximum size is 100MB, got ${Math.round(file.size / 1024 / 1024)}MB`,
        );
        return;
      }

      if (!isAudioFile(file)) {
        toast.error("Unsupported audio format. Supported formats: WAV, MP3, AIFF, FLAC, OGG");
        return;
      }

      setIsUploading(true);

      try {
        // Decode audio to get duration (FR-10)
        const { durationInSamples, fileSampleRate } = await decodeAudioFile(file);

        // Show warning if sample rates differ (FR-11)
        if (fileSampleRate !== sampleRate) {
          toast.warning(
            `Sample rate mismatch: file is ${fileSampleRate}Hz, project is ${sampleRate}Hz. Playback may be affected.`,
          );
        }

        // Generate upload URL (FR-8)
        const uploadUrl = await generateUploadUrl({ projectId });

        // Upload file to Convex storage
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };

        // Validate uploaded file (FR-5, FR-6, FR-7)
        await validateUploadedFile({
          storageId,
          projectId,
          contentType: file.type,
          size: file.size,
        });

        // Create clip record (FR-9)
        const clipName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        await createClip({
          projectId,
          trackId: dropPosition.trackId as Id<"tracks">,
          fileId: storageId,
          name: clipName,
          startTime: dropPosition.dropTimeInSamples,
          duration: durationInSamples,
        });

        toast.success(`Added "${clipName}" to timeline`);
      } catch (error) {
        console.error("Failed to upload audio file:", error);
        toast.error(error instanceof Error ? error.message : "Failed to upload audio file");
      } finally {
        setIsUploading(false);
      }
    },
    [
      isAudioFile,
      decodeAudioFile,
      generateUploadUrl,
      validateUploadedFile,
      createClip,
      projectId,
      sampleRate,
    ],
  );

  // Drag event handlers (FR-29, FR-30)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!e.dataTransfer.types.includes("Files")) return;

      e.dataTransfer.dropEffect = "copy";
      setIsDraggingFile(true);

      // Calculate and update drop target
      const target = calculateDropPosition(e.clientX, e.clientY);
      setDropTarget(target);
    },
    [calculateDropPosition],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only clear if leaving the container entirely
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setIsDraggingFile(false);
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDraggingFile(false);

      const files = Array.from(e.dataTransfer.files);
      const audioFile = files.find((f) => isAudioFile(f));

      if (!audioFile) {
        toast.error("No supported audio file found. Supported formats: WAV, MP3, AIFF, FLAC, OGG");
        setDropTarget(null);
        return;
      }

      const target = calculateDropPosition(e.clientX, e.clientY);
      setDropTarget(null);

      if (!target) {
        toast.error("Please drop the file on a track lane");
        return;
      }

      await handleFileDrop(audioFile, target);
    },
    [isAudioFile, calculateDropPosition, handleFileDrop],
  );

  // Handle wheel for zoom and scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom with ctrl/cmd + scroll, centered on cursor position
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const cursorX = e.clientX - rect.left;
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

        // Calculate time at cursor before zoom
        const timeAtCursor = (cursorX + scrollLeft) / pixelsPerSecond;

        // Calculate new zoom level
        const newPixelsPerSecond = Math.min(
          MAX_PIXELS_PER_SECOND,
          Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond * zoomFactor),
        );

        // Adjust scroll so cursor stays over the same time position
        const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

        setPixelsPerSecond(newPixelsPerSecond);
        setScrollLeft(Math.max(0, newScrollLeft));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scroll with shift or horizontal gesture
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setScrollLeft((prev) => Math.max(0, prev + delta));
      } else {
        // Vertical scroll - sync with track list
        const newScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + e.deltaY));
        onScrollChange(newScrollTop);
      }
    },
    [maxScrollTop, scrollTop, onScrollChange, scrollLeft, pixelsPerSecond],
  );

  // Store current values in refs for Safari gesture handlers
  const scrollLeftRef = useRef(scrollLeft);
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  const hoverXRef = useRef(hoverX);
  const dimensionsRef = useRef(dimensions);

  useEffect(() => {
    scrollLeftRef.current = scrollLeft;
  }, [scrollLeft]);
  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
  }, [pixelsPerSecond]);
  useEffect(() => {
    hoverXRef.current = hoverX;
  }, [hoverX]);
  useEffect(() => {
    dimensionsRef.current = dimensions;
  }, [dimensions]);

  // Prevent browser zoom on Safari trackpad pinch gestures
  // Safari fires gesturestart/gesturechange/gestureend for pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Track gesture scale for Safari pinch-to-zoom
    let lastScale = 1;

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      // GestureEvent is Safari-specific
      const gestureEvent = e as GestureEvent;
      const scale = gestureEvent.scale;
      const zoomFactor = scale / lastScale;
      lastScale = scale;

      // Use cursor position if hovering, otherwise use viewport center
      const cursorX = hoverXRef.current ?? dimensionsRef.current.width / 2;
      const currentScrollLeft = scrollLeftRef.current;
      const currentPPS = pixelsPerSecondRef.current;

      // Calculate time at cursor before zoom
      const timeAtCursor = (cursorX + currentScrollLeft) / currentPPS;

      // Calculate new zoom level
      const newPixelsPerSecond = Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, currentPPS * zoomFactor),
      );

      // Adjust scroll so cursor stays over the same time position
      const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

      setPixelsPerSecond(newPixelsPerSecond);
      setScrollLeft(Math.max(0, newScrollLeft));
    };

    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    // Add gesture event listeners (Safari only - other browsers ignore these)
    container.addEventListener("gesturestart", handleGestureStart);
    container.addEventListener("gesturechange", handleGestureChange);
    container.addEventListener("gestureend", handleGestureEnd);

    return () => {
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gesturechange", handleGestureChange);
      container.removeEventListener("gestureend", handleGestureEnd);
    };
  }, []);

  // Handle mousedown for clip dragging (FR-34)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Check if clicking on a clip
      const clip = findClipAtPosition(e.clientX, e.clientY);
      if (clip) {
        e.preventDefault();
        setClipDragState({
          clipId: clip._id,
          originalStartTime: clip.startTime,
          currentStartTime: clip.startTime,
          dragStartX: e.clientX,
        });
      }
    },
    [findClipAtPosition],
  );

  // Handle mousemove for clip dragging (FR-35)
  const handleClipDragMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!clipDragState) return;

      const deltaX = e.clientX - clipDragState.dragStartX;
      const deltaTimeInSeconds = deltaX / pixelsPerSecond;
      const deltaTimeInSamples = deltaTimeInSeconds * sampleRate;

      // Calculate new start time (clamp to 0 per FR-38)
      const newStartTime = Math.max(0, clipDragState.originalStartTime + deltaTimeInSamples);

      setClipDragState((prev) =>
        prev ? { ...prev, currentStartTime: Math.round(newStartTime) } : null,
      );
    },
    [clipDragState, pixelsPerSecond, sampleRate],
  );

  // Handle mouseup for clip dragging (FR-36)
  const handleClipDragEnd = useCallback(async () => {
    if (!clipDragState) return;

    // Mark that we just finished a drag to prevent click from seeking
    justFinishedDragRef.current = true;
    // Reset the flag on next tick
    requestAnimationFrame(() => {
      justFinishedDragRef.current = false;
    });

    const { clipId, originalStartTime, currentStartTime } = clipDragState;

    // Only update if position changed
    if (currentStartTime !== originalStartTime) {
      try {
        await updateClipPosition({
          id: clipId as Id<"clips">,
          startTime: currentStartTime,
        });
      } catch (error) {
        console.error("Failed to update clip position:", error);
        toast.error("Failed to move clip");
      }
    }

    setClipDragState(null);
  }, [clipDragState, updateClipPosition]);

  // Handle click for seeking (only if not ending a clip drag)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Don't seek if we just finished dragging a clip
      if (justFinishedDragRef.current) return;

      // Don't seek if clicking on a clip (so users can click clips without seeking)
      const clip = findClipAtPosition(e.clientX, e.clientY);
      if (clip) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond, onSeek, findClipAtPosition],
  );

  // Handle mouse move for hover indicator and clip dragging
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Handle clip dragging if active (FR-35)
      if (clipDragState) {
        handleClipDragMove(e);
      }

      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      setHoverX(canvasX);
      setHoverTime(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond, clipDragState, handleClipDragMove],
  );

  // Handle mouse leave to clear hover state and end clip drag
  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setHoverTime(null);
    // Cancel clip drag on mouse leave (don't commit changes)
    if (clipDragState) {
      setClipDragState(null);
    }
  }, [clipDragState]);

  // Handle mouse up to end clip drag (FR-36)
  const handleMouseUp = useCallback(() => {
    if (clipDragState) {
      handleClipDragEnd();
    }
  }, [clipDragState, handleClipDragEnd]);

  // Zoom in by 2x, centered on cursor or viewport center
  const handleZoomIn = useCallback(() => {
    // Use cursor position if hovering, otherwise use viewport center
    const cursorX = hoverX ?? dimensions.width / 2;
    const timeAtCursor = (cursorX + scrollLeft) / pixelsPerSecond;

    const newPixelsPerSecond = Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond * 2);

    // Adjust scroll so cursor stays over the same time position
    const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

    setPixelsPerSecond(newPixelsPerSecond);
    setScrollLeft(Math.max(0, newScrollLeft));
  }, [hoverX, dimensions.width, scrollLeft, pixelsPerSecond]);

  // Zoom out by 2x, centered on cursor or viewport center
  const handleZoomOut = useCallback(() => {
    // Use cursor position if hovering, otherwise use viewport center
    const cursorX = hoverX ?? dimensions.width / 2;
    const timeAtCursor = (cursorX + scrollLeft) / pixelsPerSecond;

    const newPixelsPerSecond = Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond / 2);

    // Adjust scroll so cursor stays over the same time position
    const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

    setPixelsPerSecond(newPixelsPerSecond);
    setScrollLeft(Math.max(0, newScrollLeft));
  }, [hoverX, dimensions.width, scrollLeft, pixelsPerSecond]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || dimensions.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim() ||
      "#09090b";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const borderColor =
      getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#27272a";
    const mutedColor =
      getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground").trim() ||
      "#71717a";

    // Calculate visible time range
    const startTime = scrollLeft / pixelsPerSecond;
    const visibleDuration = dimensions.width / pixelsPerSecond;
    const endTime = startTime + visibleDuration;

    // Draw time ruler
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, RULER_HEIGHT - 1, dimensions.width, 1);

    // Calculate marker interval based on zoom level
    let markerInterval = 1; // seconds
    const minPixelsBetweenMarkers = 60;
    while (markerInterval * pixelsPerSecond < minPixelsBetweenMarkers) {
      markerInterval *= 2;
    }

    // Draw time markers
    ctx.fillStyle = mutedColor;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";

    const firstMarker = Math.floor(startTime / markerInterval) * markerInterval;
    for (let time = firstMarker; time <= endTime; time += markerInterval) {
      const x = (time - startTime) * pixelsPerSecond;
      if (x < 0) continue;

      // Draw tick
      ctx.fillRect(x, RULER_HEIGHT - 8, 1, 8);

      // Draw time label
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, x, 12);
    }

    // Draw track lanes (accounting for vertical scroll)
    for (let i = 0; i < tracks.length; i++) {
      const y = RULER_HEIGHT + i * TRACK_HEIGHT - scrollTop;
      // Skip tracks that are outside the visible area
      if (y + TRACK_HEIGHT < RULER_HEIGHT || y > dimensions.height) continue;
      ctx.fillStyle = borderColor;
      ctx.fillRect(0, y + TRACK_HEIGHT - 1, dimensions.width, 1);
    }

    // Build track index map for clip rendering
    const trackIndexMap = new Map<string, number>();
    tracks.forEach((track, index) => {
      trackIndexMap.set(track._id, index);
    });

    // Draw clips (FR-24 through FR-28, FR-35 for dragging)
    const CLIP_PADDING = 2; // padding inside track lane
    const CLIP_BORDER_RADIUS = 4;

    for (const clip of clips) {
      const trackIndex = trackIndexMap.get(clip.trackId);
      if (trackIndex === undefined) continue;

      // Check if this clip is being dragged (FR-34, FR-35)
      const isDragging = clipDragState?.clipId === clip._id;

      // Use drag position if dragging, otherwise use original position
      const effectiveStartTime = isDragging ? clipDragState.currentStartTime : clip.startTime;

      // Convert clip times from samples to seconds
      const clipStartSeconds = effectiveStartTime / sampleRate;
      const clipDurationSeconds = clip.duration / sampleRate;
      const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

      // Skip clips that are outside the visible time range
      if (clipEndSeconds < startTime || clipStartSeconds > endTime) continue;

      // Calculate clip rectangle position and dimensions (FR-26, FR-27)
      const clipX = (clipStartSeconds - startTime) * pixelsPerSecond;
      const clipWidth = clipDurationSeconds * pixelsPerSecond;
      const trackY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop;

      // Skip clips in tracks that are outside the visible area
      if (trackY + TRACK_HEIGHT < RULER_HEIGHT || trackY > dimensions.height) continue;

      const clipY = trackY + CLIP_PADDING;
      const clipHeight = TRACK_HEIGHT - CLIP_PADDING * 2 - 1; // -1 for track lane border

      // Get track color (FR-24 - clip color inherited from track)
      const trackColor = getTrackColor(trackIndex);

      // Draw clip background (FR-24, FR-28, FR-35)
      // Reduce opacity when dragging to indicate dragging state
      ctx.fillStyle = trackColor;
      ctx.globalAlpha = isDragging ? 0.5 : 0.7;
      ctx.beginPath();
      ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
      ctx.fill();

      // Draw clip border for better visibility
      ctx.strokeStyle = trackColor;
      ctx.globalAlpha = isDragging ? 0.7 : 1;
      ctx.lineWidth = isDragging ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
      ctx.stroke();

      // Draw clip name (FR-25)
      if (clipWidth > 30) {
        // Only draw text if clip is wide enough
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = isDragging ? 0.6 : 0.9;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // Truncate text if it doesn't fit
        const textPadding = 6;
        const maxTextWidth = clipWidth - textPadding * 2;
        let displayName = clip.name;

        // Measure and truncate if needed
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxTextWidth) {
          // Truncate with ellipsis
          while (textWidth > maxTextWidth && displayName.length > 0) {
            displayName = displayName.slice(0, -1);
            textWidth = ctx.measureText(displayName + "…").width;
          }
          displayName = displayName + "…";
        }

        ctx.fillText(displayName, clipX + textPadding, clipY + clipHeight / 2);
      }

      ctx.globalAlpha = 1;
    }

    // Draw playhead
    const playheadX = (playheadTime - startTime) * pixelsPerSecond;
    if (playheadX >= 0 && playheadX <= dimensions.width) {
      ctx.fillStyle = mutedColor;
      ctx.fillRect(playheadX, 0, 1, dimensions.height);
    }

    // Draw hover indicator line
    if (hoverX !== null && hoverX >= 0 && hoverX <= dimensions.width) {
      ctx.strokeStyle = mutedColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, dimensions.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
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

  // Format time for hover tooltip
  const formatHoverTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  // Check if at zoom limits
  const canZoomIn = pixelsPerSecond < MAX_PIXELS_PER_SECOND;
  const canZoomOut = pixelsPerSecond > MIN_PIXELS_PER_SECOND;

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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
            {formatHoverTime(hoverTime)}
          </div>
        </div>
      )}
    </div>
  );
}
