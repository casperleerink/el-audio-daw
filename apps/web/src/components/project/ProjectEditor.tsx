import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { usePlayheadTime, useAudioActions } from "@/stores/audioStore";
import { useProjectKeyboardShortcuts } from "@/hooks/useProjectKeyboardShortcuts";
import { useAudioEngineSync } from "@/hooks/useAudioEngineSync";
import { useProjectData } from "@/hooks/project/useProjectData";
import { useProjectTracks } from "@/hooks/project/useProjectTracks";
import { useProjectClips } from "@/hooks/project/useProjectClips";
import { useProjectEffects } from "@/hooks/project/useProjectEffects";
import { ProjectEditorSkeleton } from "./ProjectEditorSkeleton";
import { ProjectHeader } from "./ProjectHeader";
import { TransportControls } from "./TransportControls";
import { TrackListPanel } from "./TrackListPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ProjectEffectsPanel } from "./ProjectEffectsPanel";

export function ProjectEditor() {
  const navigate = useNavigate();
  const [scrollTop, setScrollTop] = useState(0);

  const projectId = useProjectId();
  const sampleRate = useSampleRate();
  const { project, clips, clipStorageKeys, isLoading, notFound } = useProjectData();
  const { addTrack, tracksWithOptimisticUpdates } = useProjectTracks();
  const {
    handleCopyClips,
    handlePasteClips,
    handleDeleteSelectedClips,
    handleSplitClips,
    clipsForEngine,
  } = useProjectClips();
  const { effectsForEngine } = useProjectEffects();

  // Sync project data to audio engine (single source of truth)
  useAudioEngineSync({
    projectId,
    sampleRate,
    tracks: tracksWithOptimisticUpdates,
    clips: clipsForEngine,
    clipStorageKeys,
    effects: effectsForEngine,
  });

  // Use selective subscriptions from audio store
  const playheadTime = usePlayheadTime();
  const { togglePlayStop } = useAudioActions();

  const { clearClipSelection, selectAllOnTrack } = useEditorStore();

  // Wrapper for select all that passes clips to store
  const handleSelectAllOnFocusedTrack = useCallback(() => {
    selectAllOnTrack(clips.map((c) => ({ id: c.id, trackId: c.trackId, pending: false })));
  }, [clips, selectAllOnTrack]);

  // Handle keyboard shortcuts
  useProjectKeyboardShortcuts({
    onTogglePlayStop: togglePlayStop,
    onAddTrack: addTrack,
    onClearSelection: clearClipSelection,
    onSelectAllOnFocusedTrack: handleSelectAllOnFocusedTrack,
    onDeleteSelectedClips: handleDeleteSelectedClips,
    onCopyClips: handleCopyClips,
    onPasteClips: () => handlePasteClips(playheadTime),
    onSplitClips: () => handleSplitClips(playheadTime),
  });

  // Loading state
  if (isLoading) {
    return <ProjectEditorSkeleton />;
  }

  // Project not found or no access
  if (notFound || !project) {
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
      <ProjectHeader />
      <TransportControls />

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        <div className="flex min-h-0 flex-1">
          <TrackListPanel scrollTop={scrollTop} onScrollChange={setScrollTop} />
          <TimelinePanel scrollTop={scrollTop} onScrollChange={setScrollTop} />
        </div>

        <ProjectEffectsPanel />
      </div>
    </div>
  );
}
