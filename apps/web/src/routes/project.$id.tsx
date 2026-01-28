import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { AudioEngine, type TrackState } from "@el-audio-daw/audio";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Loader2,
  Pause,
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

function ProjectEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const project = useQuery(api.projects.getProject, { id: id as any });
  const tracks = useQuery(api.tracks.getProjectTracks, { projectId: id as any });

  const createTrack = useMutation(api.tracks.createTrack);
  const updateTrack = useMutation(api.tracks.updateTrack);
  const deleteTrack = useMutation(api.tracks.deleteTrack);
  const updateProject = useMutation(api.projects.updateProject);

  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [masterGain, setMasterGain] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const engineRef = useRef<AudioEngine | null>(null);
  const trackListRef = useRef<HTMLDivElement>(null);

  // Initialize audio engine
  const initializeEngine = useCallback(async () => {
    if (engineRef.current?.isInitialized()) {
      setIsEngineReady(true);
      return;
    }

    try {
      const engine = new AudioEngine();
      await engine.initialize();
      engineRef.current = engine;
      setIsEngineReady(true);

      engine.onPlayheadUpdate((time: number) => {
        setPlayheadTime(time);
      });
    } catch (err) {
      toast.error("Failed to initialize audio engine");
      console.error(err);
    }
  }, []);

  // Sync tracks to audio engine
  useEffect(() => {
    if (!engineRef.current || !tracks) return;

    const trackStates: TrackState[] = tracks.map((t) => ({
      id: t._id,
      muted: t.muted,
      solo: t.solo,
      gain: t.gain,
    }));

    engineRef.current.setTracks(trackStates);
  }, [tracks]);

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

  const handlePlay = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.play();
    setIsPlaying(true);
  }, []);

  const handleStop = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsPlaying(false);
  }, []);

  const handleTogglePlayStop = useCallback(() => {
    if (isPlaying) {
      handleStop();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handleStop]);

  const handleAddTrack = useCallback(async () => {
    try {
      await createTrack({ projectId: id as any });
    } catch {
      toast.error("Failed to create track");
    }
  }, [createTrack, id]);

  const handleUpdateTrackMute = useCallback(
    async (trackId: string, muted: boolean) => {
      try {
        await updateTrack({ id: trackId as any, muted });
      } catch {
        toast.error("Failed to update track");
      }
    },
    [updateTrack],
  );

  const handleUpdateTrackSolo = useCallback(
    async (trackId: string, solo: boolean) => {
      try {
        await updateTrack({ id: trackId as any, solo });
      } catch {
        toast.error("Failed to update track");
      }
    },
    [updateTrack],
  );

  const handleUpdateTrackGain = useCallback(
    async (trackId: string, gain: number) => {
      try {
        await updateTrack({ id: trackId as any, gain });
      } catch {
        toast.error("Failed to update track");
      }
    },
    [updateTrack],
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
      try {
        await deleteTrack({ id: trackId as any });
      } catch {
        toast.error("Failed to delete track");
      }
    },
    [deleteTrack],
  );

  const handleSaveProjectName = useCallback(async () => {
    if (!project || projectName === project.name) {
      setSettingsOpen(false);
      return;
    }

    try {
      await updateProject({ id: id as any, name: projectName });
      toast.success("Project renamed");
      setSettingsOpen(false);
    } catch {
      toast.error("Failed to rename project");
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
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
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

  // Show initialize button if engine not ready
  if (!isEngineReady) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-lg font-semibold">{project.name}</h2>
        <p className="text-sm text-muted-foreground">Click to start the audio engine</p>
        <Button onClick={initializeEngine}>
          <Play className="size-4" />
          Start Audio
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
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveProjectName();
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleSaveProjectName}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Transport Controls */}
      <div className="flex h-10 shrink-0 items-center gap-4 border-b bg-muted/30 px-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handleTogglePlayStop}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleStop}>
            <Square className="size-3" />
          </Button>
        </div>

        <div className="font-mono text-sm tabular-nums">{formatTime(playheadTime)}</div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAddTrack}>
            <Plus className="size-4" />
            Add Track
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1">
        {/* Track List */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          {/* Track Headers */}
          <VirtualizedTrackList
            ref={trackListRef}
            tracks={tracks}
            scrollTop={scrollTop}
            onScrollChange={setScrollTop}
            onMuteChange={handleUpdateTrackMute}
            onSoloChange={handleUpdateTrackSolo}
            onGainChange={handleUpdateTrackGain}
            onNameChange={handleUpdateTrackName}
            onDelete={handleDeleteTrack}
            formatGain={formatGain}
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
            onSeek={(time) => {
              engineRef.current?.setPlayhead(time);
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
  formatGain: (db: number) => string;
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
      formatGain,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null);

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

    // Forward ref
    React.useImperativeHandle(ref, () => parentRef.current as HTMLDivElement, []);

    if (tracks.length === 0) {
      return (
        <div className="flex h-32 flex-1 items-center justify-center text-sm text-muted-foreground">
          No tracks yet
        </div>
      );
    }

    return (
      <div ref={parentRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
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
              >
                <TrackHeader
                  track={track}
                  onMuteChange={(muted) => onMuteChange(track._id, muted)}
                  onSoloChange={(solo) => onSoloChange(track._id, solo)}
                  onGainChange={(gain) => onGainChange(track._id, gain)}
                  onNameChange={(name) => onNameChange(track._id, name)}
                  onDelete={() => onDelete(track._id)}
                  formatGain={formatGain}
                />
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
  onMuteChange: (muted: boolean) => void;
  onSoloChange: (solo: boolean) => void;
  onGainChange: (gain: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  formatGain: (db: number) => string;
}

function TrackHeader({
  track,
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
    <div className="box-border h-[60px] border-b p-2">
      {/* Track Name Row */}
      <div className="mb-1 flex items-center gap-1">
        {isEditing ? (
          <Input
            ref={inputRef}
            className="h-6 flex-1 text-xs"
            value={editName}
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
        ) : (
          <button
            className="flex-1 truncate text-left text-xs font-medium hover:text-foreground/80"
            onClick={() => setIsEditing(true)}
          >
            {track.name}
          </button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
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
  onSeek: (time: number) => void;
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
  }, [dimensions, tracks, playheadTime, scrollLeft, scrollTop, pixelsPerSecond]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ width: dimensions.width, height: dimensions.height }}
        onClick={handleClick}
      />
    </div>
  );
}
