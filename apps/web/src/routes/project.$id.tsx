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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddEffectDialog } from "@/components/AddEffectDialog";
import { EffectCard } from "@/components/EffectCard";
import { EffectsPanel } from "@/components/EffectsPanel";
import { FilterEffect } from "@/components/effects/FilterEffect";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { VirtualizedTrackList } from "@/components/VirtualizedTrackList";
import { MeterProvider } from "@/contexts/MeterContext";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useClipClipboard } from "@/hooks/useClipClipboard";
import { useClipDrag, type ClipData } from "@/hooks/useClipDrag";
import { useClipMouseHandlers } from "@/hooks/useClipMouseHandlers";
import { useClipTrim } from "@/hooks/useClipTrim";
import { useClipSelection } from "@/hooks/useClipSelection";
import { useEffectReorder } from "@/hooks/useEffectReorder";
import { useOptimisticTrackUpdates } from "@/hooks/useOptimisticTrackUpdates";
import { useProjectKeyboardShortcuts } from "@/hooks/useProjectKeyboardShortcuts";
import { useTimelineCanvasEvents } from "@/hooks/useTimelineCanvasEvents";
import { useTimelineFileDrop } from "@/hooks/useTimelineFileDrop";
import { useTimelineZoom } from "@/hooks/useTimelineZoom";
import { renderTimeline } from "@/lib/canvasRenderer";
import { fetchWaveform, clearWaveformCache, type WaveformData } from "@/lib/waveformCache";
import { formatGain, formatTime } from "@/lib/formatters";
import { isPending, showRollbackToast } from "@/lib/optimistic";
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";
import { CLIP_PADDING, RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import {
  createTrackOptimisticUpdate,
  deleteTrackOptimisticUpdate,
  reorderTracksOptimisticUpdate,
  updateTrackOptimisticUpdate,
} from "@/lib/trackOptimisticUpdates";
import {
  deleteClipOptimisticUpdate,
  pasteClipsOptimisticUpdate,
  splitClipOptimisticUpdate,
  trimClipOptimisticUpdate,
  updateClipPositionOptimisticUpdate,
} from "@/lib/clipOptimisticUpdates";
import { updateProjectOptimisticUpdate } from "@/lib/projectOptimisticUpdates";
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
  const audioFiles = useQuery(api.audioFiles.getProjectAudioFiles, { projectId: id as any });
  const waveformUrls = useQuery(api.audioFiles.getProjectWaveformUrls, { projectId: id as any });

  const createTrack = useMutation(api.tracks.createTrack).withOptimisticUpdate(
    createTrackOptimisticUpdate,
  );
  const updateTrack = useMutation(api.tracks.updateTrack).withOptimisticUpdate(
    updateTrackOptimisticUpdate,
  );
  const deleteTrack = useMutation(api.tracks.deleteTrack).withOptimisticUpdate(
    deleteTrackOptimisticUpdate,
  );
  const reorderTracks = useMutation(api.tracks.reorderTracks).withOptimisticUpdate(
    reorderTracksOptimisticUpdate,
  );
  const updateProject = useMutation(api.projects.updateProject).withOptimisticUpdate(
    updateProjectOptimisticUpdate,
  );
  const deleteClip = useMutation(api.clips.deleteClip).withOptimisticUpdate(
    deleteClipOptimisticUpdate,
  );
  const pasteClips = useMutation(api.clips.pasteClips).withOptimisticUpdate(
    pasteClipsOptimisticUpdate,
  );
  const splitClip = useMutation(api.clips.splitClip).withOptimisticUpdate(
    splitClipOptimisticUpdate,
  );

  // Track selection for effects panel
  const [selectedTrackIdForEffects, setSelectedTrackIdForEffects] = useState<string | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [addEffectDialogOpen, setAddEffectDialogOpen] = useState(false);

  // Effects query for selected track (UI display)
  const effects = useQuery(
    api.trackEffects.getTrackEffects,
    selectedTrackIdForEffects ? { trackId: selectedTrackIdForEffects as Id<"tracks"> } : "skip",
  );

  // Effects query for all project tracks (audio engine)
  const allProjectEffects = useQuery(api.trackEffects.getProjectEffects, {
    projectId: id as Id<"projects">,
  });

  // Effect mutations
  const createEffect = useMutation(api.trackEffects.createEffect);
  const updateEffect = useMutation(api.trackEffects.updateEffect);
  const deleteEffect = useMutation(api.trackEffects.deleteEffect);
  const reorderEffect = useMutation(api.trackEffects.reorderEffect);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const trackListRef = useRef<HTMLDivElement>(null);

  const {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  } = useOptimisticTrackUpdates(tracks, updateTrack, id);

  // Create audioFile lookup map for duration and metadata access
  // Keys are strings (Id<"audioFiles"> serializes to string)
  const audioFilesMap = new Map<
    string,
    typeof audioFiles extends (infer T)[] | undefined ? T : never
  >((audioFiles ?? []).map((af) => [af._id as string, af]));

  // Lookup function for audio file duration (used by clip trim constraints)
  const getAudioFileDuration = useCallback(
    (audioFileId: string) => audioFilesMap.get(audioFileId)?.duration,
    [audioFilesMap],
  );

  // Transform clips for audio engine (map backend format to engine format)
  const clipsForEngine = (clips ?? []).map((clip) => ({
    _id: clip._id,
    trackId: clip.trackId,
    audioFileId: clip.audioFileId,
    name: clip.name,
    startTime: clip.startTime,
    duration: clip.duration,
    audioStartTime: clip.audioStartTime,
    gain: clip.gain,
  }));

  // Transform effects for audio engine
  const effectsForEngine = useMemo(
    () =>
      (allProjectEffects ?? []).map((e) => ({
        id: e._id,
        trackId: e.trackId,
        order: e.order,
        enabled: e.enabled,
        effectData: e.effectData as {
          type: "filter";
          cutoff: number;
          resonance: number;
          filterType: "lowpass" | "highpass" | "bandpass" | "notch";
        },
      })),
    [allProjectEffects],
  );

  const {
    isEngineInitializing,
    isPlaying,
    playheadTime,
    masterGain,
    setMasterGain,
    stop: handleStop,
    togglePlayStop: handleTogglePlayStop,
    seek,
    meterSubscribe,
  } = useAudioEngine({
    sampleRate: project?.sampleRate ?? 44100,
    tracks: tracksWithOptimisticUpdates,
    clips: clipsForEngine,
    clipUrls,
    effects: effectsForEngine,
  });

  // Clip selection state (FR-1 through FR-9)
  const clipsForSelection = (clips ?? []).map((clip) => ({
    _id: clip._id,
    trackId: clip.trackId,
    pending: isPending(clip),
  }));
  const {
    selectedClipIds,
    focusedTrackId,
    selectClip,
    toggleClipSelection,
    clearSelection,
    selectAllOnFocusedTrack,
  } = useClipSelection({ clips: clipsForSelection });

  // Clipboard for copy/paste (FR-23 through FR-30)
  const { copyClips, getClipboardData, hasClips } = useClipClipboard();

  // Sample rate for time conversions
  const sampleRate = project?.sampleRate ?? 44100;

  // Copy selected clips handler (FR-23, FR-24)
  const handleCopyClips = useCallback(() => {
    if (selectedClipIds.size === 0 || !clips) return;

    // Get full clip data for selected clips
    const clipsWithData = clips.map((clip) => ({
      _id: clip._id,
      trackId: clip.trackId,
      audioFileId: clip.audioFileId,
      name: clip.name,
      startTime: clip.startTime,
      duration: clip.duration,
      audioStartTime: clip.audioStartTime,
      gain: clip.gain,
    }));

    copyClips(selectedClipIds, clipsWithData);
  }, [selectedClipIds, clips, copyClips]);

  // Paste clips at playhead handler (FR-25 through FR-29)
  const handlePasteClips = useCallback(async () => {
    // FR-30: If no clips in clipboard, do nothing
    if (!hasClips()) return;

    const clipboardData = getClipboardData();
    if (!clipboardData || clipboardData.clips.length === 0) return;

    // Target track is the same track as source (FR-27)
    const targetTrackId = clipboardData.sourceTrackId;

    // Convert playhead time (seconds) to samples
    const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

    // Build clips array with calculated start times (FR-26)
    const clipsToCreate = clipboardData.clips.map((clip) => ({
      audioFileId: clip.audioFileId,
      name: clip.name,
      startTime: playheadTimeInSamples + clip.offsetFromFirst,
      duration: clip.duration,
      audioStartTime: clip.audioStartTime,
      gain: clip.gain,
    }));

    // FR-29: Use optimistic updates
    try {
      await pasteClips({
        projectId: id as any,
        trackId: targetTrackId as any,
        clips: clipsToCreate,
      });
    } catch {
      showRollbackToast("paste clips");
    }
  }, [hasClips, getClipboardData, playheadTime, sampleRate, pasteClips, id]);

  // Delete selected clips handler (FR-10 through FR-13)
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0) return;

    // Get clip IDs as array before clearing selection
    const clipIdsToDelete = Array.from(selectedClipIds);

    // Clear selection first (optimistic behavior - clips will be gone)
    clearSelection();

    // Delete all selected clips in parallel (FR-11: optimistic updates)
    const deletePromises = clipIdsToDelete.map((clipId) =>
      deleteClip({ id: clipId as any, projectId: id as any }).catch(() => {
        // FR-12: On failure, show rollback toast (clip will reappear via Convex rollback)
        showRollbackToast("delete clip");
      }),
    );

    await Promise.all(deletePromises);
  }, [selectedClipIds, clearSelection, deleteClip, id]);

  // Split selected clips at playhead handler (FR-38 through FR-45)
  const handleSplitClips = useCallback(async () => {
    // FR-38: Split all selected clips at playhead position
    if (selectedClipIds.size === 0 || !clips) return;

    // Convert playhead time (seconds) to samples
    const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

    // FR-39: Find selected clips that span the playhead
    const clipsToSplit = clips.filter((clip) => {
      if (!selectedClipIds.has(clip._id)) return false;
      // Check if playhead is within clip bounds (exclusive of edges)
      const clipEnd = clip.startTime + clip.duration;
      return playheadTimeInSamples > clip.startTime && playheadTimeInSamples < clipEnd;
    });

    // FR-44: If playhead not intersecting any selected clips, do nothing
    if (clipsToSplit.length === 0) return;

    // FR-43: Clear selection (neither resulting clip will be selected)
    clearSelection();

    // FR-45: Split all qualifying clips in parallel with optimistic updates
    const splitPromises = clipsToSplit.map((clip) =>
      splitClip({
        id: clip._id as any,
        splitTime: playheadTimeInSamples,
        projectId: id as any,
      }).catch(() => {
        showRollbackToast("split clip");
      }),
    );

    await Promise.all(splitPromises);
  }, [selectedClipIds, clips, playheadTime, sampleRate, clearSelection, splitClip, id]);

  // Update project name when project loads
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handleAddTrack = useCallback(async () => {
    // Optimistic update shows track instantly, no loading state needed
    try {
      await createTrack({ projectId: id as any });
    } catch {
      showRollbackToast("create track");
    }
  }, [createTrack, id]);

  const handleUpdateTrackName = useCallback(
    async (trackId: string, name: string) => {
      // Pass projectId for optimistic update cache invalidation
      try {
        await updateTrack({ id: trackId as any, projectId: id as any, name });
      } catch {
        showRollbackToast("update track name");
      }
    },
    [updateTrack, id],
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      // Cancel any pending uploads for this track before deletion (FR-7)
      cancelUploadsForTrack(trackId as Id<"tracks">);

      // Optimistic update removes track instantly, no loading state needed
      // Pass projectId for optimistic update cache invalidation
      try {
        await deleteTrack({ id: trackId as any, projectId: id as any });
      } catch {
        showRollbackToast("delete track");
      }
    },
    [deleteTrack, id],
  );

  const handleReorderTracks = useCallback(
    async (trackIds: string[]) => {
      // Optimistic update reorders tracks instantly
      try {
        await reorderTracks({ projectId: id as any, trackIds: trackIds as any });
      } catch {
        showRollbackToast("reorder tracks");
      }
    },
    [reorderTracks, id],
  );

  const handleSaveProjectName = useCallback(async () => {
    if (!project || projectName === project.name) {
      setSettingsOpen(false);
      return;
    }

    // Optimistic update shows name change instantly, no loading state needed
    setSettingsOpen(false);
    try {
      await updateProject({ id: id as any, name: projectName });
    } catch {
      showRollbackToast("rename project");
    }
  }, [updateProject, id, projectName, project]);

  // Handle keyboard shortcuts
  useProjectKeyboardShortcuts({
    onTogglePlayStop: handleTogglePlayStop,
    onAddTrack: handleAddTrack,
    onClearSelection: clearSelection,
    onSelectAllOnFocusedTrack: selectAllOnFocusedTrack,
    onDeleteSelectedClips: handleDeleteSelectedClips,
    onCopyClips: handleCopyClips,
    onPasteClips: handlePasteClips,
    onSplitClips: handleSplitClips,
  });

  // Handle track header click for effects panel
  const handleTrackSelect = useCallback((trackId: string) => {
    setSelectedTrackIdForEffects((prev) => (prev === trackId ? null : trackId));
    setSelectedEffectId(null);
  }, []);

  // Handle adding an effect
  const handleAddEffect = useCallback(
    async (type: "filter") => {
      if (!selectedTrackIdForEffects) return;

      const defaultEffectData =
        type === "filter"
          ? {
              type: "filter" as const,
              cutoff: 1000,
              resonance: 0.5,
              filterType: "lowpass" as const,
            }
          : null;

      if (!defaultEffectData) return;

      await createEffect({
        trackId: selectedTrackIdForEffects as Id<"tracks">,
        effectData: defaultEffectData,
      });
    },
    [selectedTrackIdForEffects, createEffect],
  );

  // Handle effect parameter commit (to server)
  const handleEffectParamCommit = useCallback(
    async (
      effectId: string,
      effectData: {
        type: "filter";
        cutoff: number;
        resonance: number;
        filterType: "lowpass" | "highpass" | "bandpass" | "notch";
      },
    ) => {
      await updateEffect({
        id: effectId as Id<"trackEffects">,
        effectData,
      });
    },
    [updateEffect],
  );

  // Handle effect enabled toggle
  const handleEffectEnabledChange = useCallback(
    async (effectId: string, enabled: boolean) => {
      await updateEffect({
        id: effectId as Id<"trackEffects">,
        enabled,
      });
    },
    [updateEffect],
  );

  // Handle effect deletion via keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedEffectId &&
        selectedTrackIdForEffects
      ) {
        // Don't delete effect if we're in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        e.preventDefault();
        void deleteEffect({ id: selectedEffectId as Id<"trackEffects"> });
        setSelectedEffectId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEffectId, selectedTrackIdForEffects, deleteEffect]);

  // Effect reorder hook
  const { handleDragStart: handleEffectDragStart, handleDragEnd: handleEffectDragEnd } =
    useEffectReorder({
      effects: effects ?? [],
      onReorder: (effectId, newOrder) => {
        void reorderEffect({ id: effectId as Id<"trackEffects">, newOrder });
      },
    });

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
              <Button onClick={handleSaveProjectName}>Save</Button>
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
                <Button variant="outline" size="sm" onClick={handleAddTrack}>
                  <Plus className="size-4" />
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {/* Track List */}
          <div className="flex w-64 shrink-0 flex-col border-r">
            {/* Spacer to align with timeline ruler */}
            <div className="h-6 shrink-0 border-b" />
            {/* Track Headers */}
            <MeterProvider subscribe={meterSubscribe}>
              <VirtualizedTrackList
                ref={trackListRef}
                tracks={tracksWithOptimisticUpdates ?? []}
                scrollTop={scrollTop}
                focusedTrackId={focusedTrackId}
                selectedTrackId={selectedTrackIdForEffects}
                onScrollChange={setScrollTop}
                onMuteChange={handleUpdateTrackMute}
                onSoloChange={handleUpdateTrackSolo}
                onGainChange={handleUpdateTrackGain}
                onGainCommit={handleCommitTrackGain}
                onPanChange={handleUpdateTrackPan}
                onPanCommit={handleCommitTrackPan}
                onNameChange={handleUpdateTrackName}
                onDelete={handleDeleteTrack}
                onReorder={handleReorderTracks}
                onAddTrack={handleAddTrack}
                onTrackSelect={handleTrackSelect}
              />
            </MeterProvider>

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
                <span className="w-16 text-right font-mono text-xs whitespace-nowrap">
                  {formatGain(masterGain)}
                </span>
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
                audioFileId: clip.audioFileId,
                name: clip.name,
                startTime: clip.startTime,
                duration: clip.duration,
                audioStartTime: clip.audioStartTime,
                pending: isPending(clip),
              }))}
              sampleRate={project?.sampleRate ?? 44100}
              playheadTime={playheadTime}
              scrollTop={scrollTop}
              onScrollChange={setScrollTop}
              onSeek={seek}
              projectId={id as Id<"projects">}
              selectedClipIds={selectedClipIds}
              onSelectClip={selectClip}
              onToggleClipSelection={toggleClipSelection}
              onClearSelection={clearSelection}
              getAudioFileDuration={getAudioFileDuration}
              waveformUrls={waveformUrls ?? {}}
            />
          </div>
        </div>

        {/* Effects Panel */}
        {selectedTrackIdForEffects && (
          <EffectsPanel
            selectedTrackId={selectedTrackIdForEffects}
            selectedTrackName={
              tracks?.find((t) => t._id === selectedTrackIdForEffects)?.name ?? "Track"
            }
            selectedTrackIndex={tracks?.findIndex((t) => t._id === selectedTrackIdForEffects) ?? 0}
            onClose={() => setSelectedTrackIdForEffects(null)}
            onAddEffect={() => setAddEffectDialogOpen(true)}
          >
            {(effects ?? []).map((effect) => (
              <EffectCard
                key={effect._id}
                id={effect._id}
                name={effect.effectData.type === "filter" ? "Filter" : "Effect"}
                enabled={effect.enabled}
                selected={selectedEffectId === effect._id}
                onSelect={() => setSelectedEffectId(effect._id)}
                onEnabledChange={(enabled) => handleEffectEnabledChange(effect._id, enabled)}
                onDragStart={(e) => handleEffectDragStart(e, effect._id)}
                onDragEnd={handleEffectDragEnd}
              >
                {effect.effectData.type === "filter" && (
                  <FilterEffect
                    cutoff={effect.effectData.cutoff}
                    resonance={effect.effectData.resonance}
                    filterType={effect.effectData.filterType}
                    onCutoffChange={() => {}}
                    onCutoffCommit={(v) =>
                      handleEffectParamCommit(effect._id, { ...effect.effectData, cutoff: v })
                    }
                    onResonanceChange={() => {}}
                    onResonanceCommit={(v) =>
                      handleEffectParamCommit(effect._id, { ...effect.effectData, resonance: v })
                    }
                    onFilterTypeChange={(type) =>
                      handleEffectParamCommit(effect._id, {
                        ...effect.effectData,
                        filterType: type,
                      })
                    }
                  />
                )}
              </EffectCard>
            ))}
          </EffectsPanel>
        )}
      </div>

      {/* Add Effect Dialog */}
      <AddEffectDialog
        open={addEffectDialogOpen}
        onOpenChange={setAddEffectDialogOpen}
        onSelectEffect={handleAddEffect}
      />
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
  selectedClipIds: Set<string>;
  onSelectClip: (clipId: string, trackId: string) => void;
  onToggleClipSelection: (clipId: string, trackId: string) => void;
  onClearSelection: () => void;
  /** Lookup function for audio file duration (for trim constraints) */
  getAudioFileDuration: (audioFileId: string) => number | undefined;
  /** Waveform URLs keyed by audioFileId */
  waveformUrls: Record<string, string | null>;
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
  selectedClipIds,
  onSelectClip,
  onToggleClipSelection,
  onClearSelection,
  getAudioFileDuration,
  waveformUrls,
}: TimelineCanvasProps) {
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

  // Mutation for clip position update with optimistic updates
  const updateClipPosition = useMutation(api.clips.updateClipPosition).withOptimisticUpdate(
    updateClipPositionOptimisticUpdate,
  );

  // Mutation for clip trim with optimistic updates (FR-21)
  const trimClip = useMutation(api.clips.trimClip).withOptimisticUpdate(trimClipOptimisticUpdate);

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
