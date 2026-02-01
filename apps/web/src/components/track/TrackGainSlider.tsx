import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, zql } from "@el-audio-daw/zero";

import { formatGain } from "@/lib/formatters";
import { Slider } from "@/components/ui/slider";
import { TrackMeter } from "@/components/TrackMeter";
import { useAudioStore } from "@/stores/audioStore";

interface TrackGainSliderProps {
  trackId: string;
}

export function TrackGainSlider({ trackId }: TrackGainSliderProps) {
  const z = useZero();
  const [track] = useQuery(zql.tracks.where("id", trackId).one());
  const setTrackGain = useAudioStore((s) => s.setTrackGain);

  const gain = track?.gain ?? 0;
  const [localGain, setLocalGain] = useState(gain);
  const isDraggingRef = useRef(false);

  // Sync from server when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalGain(gain);
    }
  }, [gain]);

  const handleChange = useCallback(
    (value: number | readonly number[]) => {
      const gainValue = Array.isArray(value) ? value[0] ?? 0 : value;
      isDraggingRef.current = true;
      setLocalGain(gainValue);
      setTrackGain(trackId, gainValue);
    },
    [trackId, setTrackGain]
  );

  const handleCommit = useCallback(
    (value: number | readonly number[]) => {
      const gainValue = Array.isArray(value) ? value[0] ?? 0 : value;
      isDraggingRef.current = false;
      z.mutate(mutators.tracks.update({ id: trackId, gain: gainValue }));
    },
    [z, trackId]
  );

  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center justify-between border-l border-border/50 px-1.5 py-1.5">
      <div className="relative flex flex-1 items-center justify-center">
        <TrackMeter trackId={trackId} orientation="vertical" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Slider
            orientation="vertical"
            min={-60}
            max={12}
            step={0.1}
            value={[localGain]}
            transparentTrack
            onValueChange={handleChange}
            onValueCommit={handleCommit}
          />
        </div>
      </div>
      <span className="mt-1 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
        {formatGain(localGain)}
      </span>
    </div>
  );
}
