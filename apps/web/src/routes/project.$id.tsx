import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { AudioEngine, type TrackState } from "@el-audio-daw/audio";
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
  VolumeX,
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
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
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

  const createTrack = useMutation(api.tracks.createTrack);
  const updateTrack = useMutation(api.tracks.updateTrack);
  const deleteTrack = useMutation(api.tracks.deleteTrack);
  const reorderTracks = useMutation(api.tracks.reorderTracks);
  const updateProject = useMutation(api.projects.updateProject);

  const [isEngineInitializing, setIsEngineInitializing] = useState(false);
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
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
  }, []);

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
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
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
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
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
      className={`box-border h-[60px] border-b p-2 ${isDragging ? "opacity-50" : ""}`}
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

interface TimelineCanvasProps {
  tracks: { _id: string; name: string }[];
  playheadTime: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
}

const TRACK_HEIGHT = 60;
const RULER_HEIGHT = 24;
const DEFAULT_PIXELS_PER_SECOND = 20;
const MIN_PIXELS_PER_SECOND = 2;
const MAX_PIXELS_PER_SECOND = 200;

function TimelineCanvas({
  tracks,
  playheadTime,
  scrollTop,
  onScrollChange,
  onSeek,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  // Hover state for timeline cursor indicator
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

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

  // Handle wheel for zoom and scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom with ctrl/cmd + scroll
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setPixelsPerSecond((prev) =>
          Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, prev * zoomFactor)),
        );
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
    [maxScrollTop, scrollTop, onScrollChange],
  );

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

      setPixelsPerSecond((prev) =>
        Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, prev * zoomFactor)),
      );
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

  // Handle click for seeking
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond, onSeek],
  );

  // Handle mouse move for hover indicator
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      setHoverX(canvasX);
      setHoverTime(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond],
  );

  // Handle mouse leave to clear hover state
  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setHoverTime(null);
  }, []);

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
  }, [dimensions, tracks, playheadTime, scrollLeft, scrollTop, pixelsPerSecond, hoverX]);

  // Format time for hover tooltip
  const formatHoverTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden"
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ width: dimensions.width, height: dimensions.height }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
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
