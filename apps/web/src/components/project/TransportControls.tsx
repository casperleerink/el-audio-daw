import { Loader2, Pause, Play, Plus, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { formatTime } from "@/lib/formatters";
import { useAudioStore } from "@/stores/audioStore";
import { useProjectTracks } from "@/hooks/project/useProjectTracks";

function PlayheadDisplay() {
  const playheadTime = useAudioStore((s) => s.playheadTime);
  return <div className="font-mono text-sm tabular-nums">{formatTime(playheadTime)}</div>;
}

export function TransportControls() {
  const isEngineInitializing = useAudioStore((s) => s.isEngineInitializing);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlayStop = useAudioStore((s) => s.togglePlayStop);
  const stop = useAudioStore((s) => s.stop);
  const { addTrack } = useProjectTracks();

  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b bg-muted/30 px-4">
      <div className="flex items-center gap-1">
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={togglePlayStop}
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
              <Button variant="ghost" size="icon-sm" onClick={stop} disabled={isEngineInitializing}>
                <Square className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Stop</TooltipContent>
        </Tooltip>
      </div>

      <PlayheadDisplay />

      <div className="ml-auto flex items-center gap-2">
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" onClick={addTrack}>
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
  );
}
