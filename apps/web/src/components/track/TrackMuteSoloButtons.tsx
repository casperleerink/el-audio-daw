import { useCallback } from "react";
import { VolumeX } from "lucide-react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, zql } from "@el-audio-daw/zero";

import { Toggle } from "@/components/ui/toggle";

interface TrackMuteSoloButtonsProps {
  trackId: string;
}

export function TrackMuteSoloButtons({ trackId }: TrackMuteSoloButtonsProps) {
  const z = useZero();
  const [track] = useQuery(zql.tracks.where("id", trackId).one());

  const muted = track?.muted ?? false;
  const solo = track?.solo ?? false;

  const handleMuteChange = useCallback(
    (pressed: boolean) => {
      z.mutate(mutators.tracks.update({ id: trackId, muted: pressed }));
    },
    [z, trackId],
  );

  const handleSoloChange = useCallback(
    (pressed: boolean) => {
      z.mutate(mutators.tracks.update({ id: trackId, solo: pressed }));
    },
    [z, trackId],
  );

  return (
    <div className="flex gap-1">
      <Toggle
        size="sm"
        pressed={muted}
        onPressedChange={handleMuteChange}
        className="h-7 w-7 bg-muted/50 px-0 hover:bg-muted data-[state=on]:bg-yellow-500 data-[state=on]:text-yellow-950 data-[state=on]:hover:bg-yellow-400"
      >
        {muted ? (
          <VolumeX className="size-3.5" />
        ) : (
          <span className="text-xs font-semibold">M</span>
        )}
      </Toggle>
      <Toggle
        size="sm"
        pressed={solo}
        onPressedChange={handleSoloChange}
        className="h-7 w-7 bg-muted/50 px-0 hover:bg-muted data-[state=on]:bg-green-500 data-[state=on]:text-green-950 data-[state=on]:hover:bg-green-400"
      >
        <span className="text-xs font-semibold">S</span>
      </Toggle>
    </div>
  );
}
