import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { zql } from "@el-audio-daw/zero";

import { Button } from "@/components/ui/button";
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";
import { useUndoStore } from "@/stores/undoStore";
import { deleteTrackCommand } from "@/commands/trackCommands";

interface TrackDeleteButtonProps {
  trackId: string;
}

export function TrackDeleteButton({ trackId }: TrackDeleteButtonProps) {
  const z = useZero();
  const pushUndo = useUndoStore((s) => s.push);
  const [track] = useQuery(zql.tracks.where("id", trackId).one());
  const [clips] = useQuery(zql.clips.where("trackId", trackId));

  const handleDelete = useCallback(async () => {
    if (!track) return;
    cancelUploadsForTrack(trackId);

    const trackSnapshot = {
      id: track.id,
      projectId: track.projectId,
      name: track.name,
      order: track.order,
      color: track.color,
    };

    const clipSnapshots = clips.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      trackId: c.trackId,
      audioFileId: c.audioFileId,
      name: c.name,
      startTime: c.startTime,
      duration: c.duration,
      audioStartTime: c.audioStartTime,
      gain: c.gain ?? 0,
    }));

    const cmd = deleteTrackCommand(z, trackSnapshot, clipSnapshots);
    await cmd.execute();
    pushUndo(cmd);
  }, [z, trackId, track, clips, pushUndo]);

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground hover:text-destructive"
      onClick={handleDelete}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
