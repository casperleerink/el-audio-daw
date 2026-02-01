import { createFileRoute, useNavigate } from "@tanstack/react-router";

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
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";
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
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import { Authenticated, AuthLoading, Unauthenticated } from "@/components/util/auth";
import { useQuery, useZero } from "@rocicorp/zero/react";

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
  loader: async ({ context, params }) => {
    const { zero } = context;

    // Preload project with all tracks, clips, effects and audio files for the project
    await zero.preload(queries.projects.byId({ id: params.id })).complete;
  },
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
  const z = useZero();
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Single query loads project with all related data (tracks, clips, audioFiles, effects)
  const [project] = useQuery(queries.projects.byId({ id: id }));

  // Extract related data from project (already synced via .related() in the query)
  const tracks = project?.tracks ?? [];
  const clips = project?.clips ?? [];
  const audioFiles = project?.audioFiles ?? [];

  // Build clipUrls and waveformUrls from audioFiles (they have storageUrl and waveformUrl)
  const clipUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const clip of clips) {
      const audioFile = clip.audioFile;
      if (audioFile?.storageUrl) {
        urls[clip.id] = audioFile.storageUrl;
      }
    }
    return urls;
  }, [clips]);

  const waveformUrls = useMemo(() => {
    const urls: Record<string, string | null> = {};
    for (const audioFile of audioFiles) {
      urls[audioFile.id] = audioFile.waveformUrl ?? null;
    }
    return urls;
  }, [audioFiles]);

  // Track selection for effects panel
  const [selectedTrackIdForEffects, setSelectedTrackIdForEffects] = useState<string | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [addEffectDialogOpen, setAddEffectDialogOpen] = useState(false);

  // Effects for selected track (from the already-loaded tracks data)
  const effects = useMemo(() => {
    if (!selectedTrackIdForEffects) return [];
    const track = tracks.find((t) => t.id === selectedTrackIdForEffects);
    return track?.effects ?? [];
  }, [tracks, selectedTrackIdForEffects]);

  // All effects for audio engine (flattened from all tracks)
  const allProjectEffects = useMemo(() => {
    return tracks.flatMap((t) => t.effects ?? []);
  }, [tracks]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const trackListRef = useRef<HTMLDivElement>(null);

  // Zero mutation wrapper for track updates (used by useOptimisticTrackUpdates)
  const updateTrack = useCallback(
    async (args: { id: string; muted?: boolean; solo?: boolean; gain?: number; pan?: number }) => {
      const { id: trackId, ...updates } = args;
      await z.mutate(mutators.tracks.update({ id: trackId, ...updates })).client;
    },
    [z],
  );

  // Transform tracks to match expected format for useOptimisticTrackUpdates
  const tracksForOptimistic = useMemo(
    () =>
      tracks.map((t) => ({
        _id: t.id,
        muted: t.muted ?? false,
        solo: t.solo ?? false,
        gain: t.gain ?? 0,
        pan: t.pan ?? 0,
        name: t.name,
        order: t.order,
        color: t.color,
        projectId: t.projectId,
      })),
    [tracks],
  );

  const {
    tracksWithOptimisticUpdates,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  } = useOptimisticTrackUpdates(tracksForOptimistic, updateTrack, id);

  // Create audioFile lookup map for duration and metadata access
  const audioFilesMap = useMemo(() => new Map(audioFiles.map((af) => [af.id, af])), [audioFiles]);

  // Lookup function for audio file duration (used by clip trim constraints)
  const getAudioFileDuration = useCallback(
    (audioFileId: string) => audioFilesMap.get(audioFileId)?.duration,
    [audioFilesMap],
  );

  // Transform clips for audio engine (map backend format to engine format)
  const clipsForEngine = useMemo(
    () =>
      clips.map((clip) => ({
        _id: clip.id,
        trackId: clip.trackId,
        audioFileId: clip.audioFileId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        audioStartTime: clip.audioStartTime,
        gain: clip.gain ?? 0,
      })),
    [clips],
  );

  // Transform effects for audio engine
  const effectsForEngine = useMemo(
    () =>
      allProjectEffects.map((e) => ({
        id: e.id,
        trackId: e.trackId,
        order: e.order,
        enabled: e.enabled ?? true,
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
  const clipsForSelection = useMemo(
    () =>
      clips.map((clip) => ({
        _id: clip.id,
        trackId: clip.trackId,
        pending: false, // Zero mutations are instant, no pending state
      })),
    [clips],
  );
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
    if (selectedClipIds.size === 0 || clips.length === 0) return;

    // Get full clip data for selected clips
    const clipsWithData = clips.map((clip) => ({
      _id: clip.id,
      trackId: clip.trackId,
      audioFileId: clip.audioFileId,
      name: clip.name,
      startTime: clip.startTime,
      duration: clip.duration,
      audioStartTime: clip.audioStartTime,
      gain: clip.gain ?? 0,
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

    // Create all clips using Zero mutator
    for (const clip of clipboardData.clips) {
      await z.mutate(
        mutators.clips.create({
          id: crypto.randomUUID(),
          projectId: id,
          trackId: targetTrackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: playheadTimeInSamples + clip.offsetFromFirst,
          duration: clip.duration,
          audioStartTime: clip.audioStartTime,
          gain: clip.gain,
        }),
      );
    }
  }, [hasClips, getClipboardData, playheadTime, sampleRate, z, id]);

  // Delete selected clips handler (FR-10 through FR-13)
  const handleDeleteSelectedClips = useCallback(async () => {
    if (selectedClipIds.size === 0) return;

    // Get clip IDs as array before clearing selection
    const clipIdsToDelete = Array.from(selectedClipIds);

    // Clear selection first (optimistic behavior - clips will be gone)
    clearSelection();

    // Delete all selected clips using Zero mutator
    for (const clipId of clipIdsToDelete) {
      await z.mutate(mutators.clips.delete({ id: clipId }));
    }
  }, [selectedClipIds, clearSelection, z]);

  // Split selected clips at playhead handler (FR-38 through FR-45)
  const handleSplitClips = useCallback(async () => {
    // FR-38: Split all selected clips at playhead position
    if (selectedClipIds.size === 0 || clips.length === 0) return;

    // Convert playhead time (seconds) to samples
    const playheadTimeInSamples = Math.round(playheadTime * sampleRate);

    // FR-39: Find selected clips that span the playhead
    const clipsToSplit = clips.filter((clip) => {
      if (!selectedClipIds.has(clip.id)) return false;
      // Check if playhead is within clip bounds (exclusive of edges)
      const clipEnd = clip.startTime + clip.duration;
      return playheadTimeInSamples > clip.startTime && playheadTimeInSamples < clipEnd;
    });

    // FR-44: If playhead not intersecting any selected clips, do nothing
    if (clipsToSplit.length === 0) return;

    // FR-43: Clear selection (neither resulting clip will be selected)
    clearSelection();

    // FR-45: Split all qualifying clips - update original and create new clip
    for (const clip of clipsToSplit) {
      const splitPoint = playheadTimeInSamples - clip.startTime;
      const newDuration = splitPoint;
      const secondClipDuration = clip.duration - splitPoint;
      const secondClipAudioStartTime = clip.audioStartTime + splitPoint;

      // Update original clip to be shorter
      await z.mutate(
        mutators.clips.update({
          id: clip.id,
          duration: newDuration,
        }),
      );

      // Create new clip for the second half
      await z.mutate(
        mutators.clips.create({
          id: crypto.randomUUID(),
          projectId: id,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: playheadTimeInSamples,
          duration: secondClipDuration,
          audioStartTime: secondClipAudioStartTime,
          gain: clip.gain ?? 0,
        }),
      );
    }
  }, [selectedClipIds, clips, playheadTime, sampleRate, clearSelection, z, id]);

  // Update project name when project loads
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handleAddTrack = useCallback(async () => {
    const trackCount = tracks.length;
    await z.mutate(
      mutators.tracks.create({
        id: crypto.randomUUID(),
        projectId: id,
        name: `Track ${trackCount + 1}`,
        order: trackCount,
      }),
    );
  }, [z, id, tracks.length]);

  const handleUpdateTrackName = useCallback(
    async (trackId: string, name: string) => {
      await z.mutate(mutators.tracks.update({ id: trackId, name }));
    },
    [z],
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      // Cancel any pending uploads for this track before deletion (FR-7)
      cancelUploadsForTrack(trackId);

      await z.mutate(mutators.tracks.delete({ id: trackId }));
    },
    [z],
  );

  const handleReorderTracks = useCallback(
    async (trackIds: string[]) => {
      await z.mutate(mutators.tracks.reorder({ projectId: id, trackIds }));
    },
    [z, id],
  );

  const handleSaveProjectName = useCallback(async () => {
    if (!project || projectName === project.name) {
      setSettingsOpen(false);
      return;
    }

    setSettingsOpen(false);
    await z.mutate(mutators.projects.update({ id, name: projectName }));
  }, [z, id, projectName, project]);

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

      // Get current effect count for order
      const currentEffects = effects ?? [];
      const order = currentEffects.length;

      await z.mutate(
        mutators.trackEffects.create({
          id: crypto.randomUUID(),
          trackId: selectedTrackIdForEffects,
          order,
          enabled: true,
          effectData: defaultEffectData,
        }),
      );
    },
    [selectedTrackIdForEffects, effects, z],
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
      await z.mutate(mutators.trackEffects.update({ id: effectId, effectData }));
    },
    [z],
  );

  // Handle effect enabled toggle
  const handleEffectEnabledChange = useCallback(
    async (effectId: string, enabled: boolean) => {
      await z.mutate(mutators.trackEffects.update({ id: effectId, enabled }));
    },
    [z],
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
        void z.mutate(mutators.trackEffects.delete({ id: selectedEffectId }));
        setSelectedEffectId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEffectId, selectedTrackIdForEffects, z]);

  // Effect reorder hook
  const { handleDragStart: handleEffectDragStart, handleDragEnd: handleEffectDragEnd } =
    useEffectReorder({
      effects: effects.map((e) => ({ ...e, _id: e.id })),
      onReorder: (effectId, newOrder) => {
        if (!selectedTrackIdForEffects) return;
        // Get all effect IDs in the new order
        const currentEffects = [...effects].sort((a, b) => a.order - b.order);
        const effectIds = currentEffects.map((e) => e.id);
        // Move the effect to its new position
        const oldIndex = effectIds.indexOf(effectId);
        if (oldIndex !== -1) {
          effectIds.splice(oldIndex, 1);
          effectIds.splice(newOrder, 0, effectId);
        }
        void z.mutate(
          mutators.trackEffects.reorder({
            trackId: selectedTrackIdForEffects,
            effectIds,
          }),
        );
      },
    });

  // Loading state
  if (project === undefined) {
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
    <div className="flex h-screen flex-col">
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
                  className={`text-xs ${
                    projectName.length >= 50 ? "text-destructive" : "text-muted-foreground"
                  }`}
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
      <div className="flex min-h-0 flex-1 flex-col justify-between">
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
              tracks={tracks.map((t) => ({ _id: t.id, name: t.name }))}
              clips={clips.map((clip) => ({
                _id: clip.id,
                trackId: clip.trackId,
                audioFileId: clip.audioFileId,
                name: clip.name,
                startTime: clip.startTime,
                duration: clip.duration,
                audioStartTime: clip.audioStartTime,
                pending: false,
              }))}
              sampleRate={project?.sampleRate ?? 44100}
              playheadTime={playheadTime}
              scrollTop={scrollTop}
              onScrollChange={setScrollTop}
              onSeek={seek}
              projectId={id}
              selectedClipIds={selectedClipIds}
              onSelectClip={selectClip}
              onToggleClipSelection={toggleClipSelection}
              onClearSelection={clearSelection}
              getAudioFileDuration={getAudioFileDuration}
              waveformUrls={waveformUrls}
            />
          </div>
        </div>

        {/* Effects Panel */}
        {selectedTrackIdForEffects && (
          <EffectsPanel
            selectedTrackId={selectedTrackIdForEffects}
            selectedTrackName={
              tracks.find((t) => t.id === selectedTrackIdForEffects)?.name ?? "Track"
            }
            selectedTrackIndex={tracks.findIndex((t) => t.id === selectedTrackIdForEffects) ?? 0}
            onClose={() => setSelectedTrackIdForEffects(null)}
            onAddEffect={() => setAddEffectDialogOpen(true)}
          >
            {effects.map((effect) => (
              <EffectCard
                key={effect.id}
                id={effect.id}
                name={
                  (effect.effectData as { type: string }).type === "filter" ? "Filter" : "Effect"
                }
                enabled={effect.enabled ?? true}
                selected={selectedEffectId === effect.id}
                onSelect={() => setSelectedEffectId(effect.id)}
                onEnabledChange={(enabled) => handleEffectEnabledChange(effect.id, enabled)}
                onDragStart={(e) => handleEffectDragStart(e, effect.id)}
                onDragEnd={handleEffectDragEnd}
              >
                {(effect.effectData as { type: string }).type === "filter" && (
                  <FilterEffect
                    cutoff={(effect.effectData as { cutoff: number }).cutoff}
                    resonance={(effect.effectData as { resonance: number }).resonance}
                    filterType={
                      (
                        effect.effectData as {
                          filterType: "lowpass" | "highpass" | "bandpass" | "notch";
                        }
                      ).filterType
                    }
                    onCutoffChange={() => {}}
                    onCutoffCommit={(v) =>
                      handleEffectParamCommit(effect.id, {
                        ...(effect.effectData as {
                          type: "filter";
                          cutoff: number;
                          resonance: number;
                          filterType: "lowpass" | "highpass" | "bandpass" | "notch";
                        }),
                        cutoff: v,
                      })
                    }
                    onResonanceChange={() => {}}
                    onResonanceCommit={(v) =>
                      handleEffectParamCommit(effect.id, {
                        ...(effect.effectData as {
                          type: "filter";
                          cutoff: number;
                          resonance: number;
                          filterType: "lowpass" | "highpass" | "bandpass" | "notch";
                        }),
                        resonance: v,
                      })
                    }
                    onFilterTypeChange={(type) =>
                      handleEffectParamCommit(effect.id, {
                        ...(effect.effectData as {
                          type: "filter";
                          cutoff: number;
                          resonance: number;
                          filterType: "lowpass" | "highpass" | "bandpass" | "notch";
                        }),
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
