import { useCallback, useRef } from "react";

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
  const { trackIds, addTrack, reorderTracks } = useProjectTracks();

  // Use ref to keep callback stable while accessing latest selectedTrackId
  const selectedTrackIdRef = useRef(selectedTrackId);
  selectedTrackIdRef.current = selectedTrackId;

  const handleTrackSelect = useCallback(
    (trackId: string) => {
      selectTrack(selectedTrackIdRef.current === trackId ? null : trackId);
    },
    [selectTrack],
  );

  return (
    <div className="flex w-64 shrink-0 flex-col border-r">
      {/* Spacer to align with timeline ruler */}
      <div className="h-6 shrink-0 border-b" />
      {/* Track Headers */}
      <MeterProvider subscribe={meterSubscribe}>
        <VirtualizedTrackList
          ref={trackListRef}
          trackIds={trackIds}
          scrollTop={scrollTop}
          focusedTrackId={focusedTrackId}
          selectedTrackId={selectedTrackId}
          onScrollChange={onScrollChange}
          onReorder={reorderTracks}
          onAddTrack={addTrack}
          onTrackSelect={handleTrackSelect}
        />
      </MeterProvider>

      <MasterTrack />
    </div>
  );
}
