import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, zql } from "@el-audio-daw/zero";

import { formatPan } from "@/lib/formatters";
import { Knob } from "@/components/ui/knob";
import { useAudioStore } from "@/stores/audioStore";

interface TrackPanKnobProps {
  trackId: string;
}

export function TrackPanKnob({ trackId }: TrackPanKnobProps) {
  const z = useZero();
  const [track] = useQuery(zql.tracks.where("id", trackId).one());
  const setTrackPan = useAudioStore((s) => s.setTrackPan);

  const pan = track?.pan ?? 0;
  const [localPan, setLocalPan] = useState(pan);
  const isDraggingRef = useRef(false);

  // Sync from server when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalPan(pan);
    }
  }, [pan]);

  const handleChange = useCallback(
    (value: number) => {
      isDraggingRef.current = true;
      setLocalPan(value);
      setTrackPan(trackId, value);
    },
    [trackId, setTrackPan],
  );

  const handleCommit = useCallback(
    (value: number) => {
      isDraggingRef.current = false;
      z.mutate(mutators.tracks.update({ id: trackId, pan: value }));
    },
    [z, trackId],
  );

  return (
    <div className="flex items-center gap-1.5">
      <Knob
        value={localPan}
        min={-1}
        max={1}
        step={0.02}
        size={26}
        onChange={handleChange}
        onCommit={handleCommit}
      />
      <span className="w-6 text-center font-mono text-[10px] text-muted-foreground">
        {formatPan(localPan)}
      </span>
    </div>
  );
}
