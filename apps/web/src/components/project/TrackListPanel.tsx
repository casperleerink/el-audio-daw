import { useRef } from "react";

import { VirtualizedTrackList } from "@/components/VirtualizedTrackList";
import { MeterProvider } from "@/contexts/MeterContext";
import { useEditorStore } from "@/stores/editorStore";
import { useMeterSubscription } from "@/hooks/useMeterSubscription";
import { useProjectTracks } from "@/hooks/project/useProjectTracks";
import { MasterTrack } from "./MasterTrack";

interface TrackListPanelProps {
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
}

export function TrackListPanel({ scrollTop, onScrollChange }: TrackListPanelProps) {
  const trackListRef = useRef<HTMLDivElement>(null);

  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const focusedTrackId = useEditorStore((s) => s.focusedTrackId);
  const { selectTrack } = useEditorStore();

  const { subscribe: meterSubscribe } = useMeterSubscription();
  const {
    tracksWithOptimisticUpdates,
    addTrack,
    updateTrackName,
    deleteTrack,
    reorderTracks,
    handleUpdateTrackMute,
    handleUpdateTrackSolo,
    handleUpdateTrackGain,
    handleCommitTrackGain,
    handleUpdateTrackPan,
    handleCommitTrackPan,
  } = useProjectTracks();

  // Handle track header click for effects panel
  const handleTrackSelect = (trackId: string) => {
    selectTrack(selectedTrackId === trackId ? null : trackId);
  };

  return (
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
          selectedTrackId={selectedTrackId}
          onScrollChange={onScrollChange}
          onMuteChange={handleUpdateTrackMute}
          onSoloChange={handleUpdateTrackSolo}
          onGainChange={handleUpdateTrackGain}
          onGainCommit={handleCommitTrackGain}
          onPanChange={handleUpdateTrackPan}
          onPanCommit={handleCommitTrackPan}
          onNameChange={updateTrackName}
          onDelete={deleteTrack}
          onReorder={reorderTracks}
          onAddTrack={addTrack}
          onTrackSelect={handleTrackSelect}
        />
      </MeterProvider>

      <MasterTrack />
    </div>
  );
}
