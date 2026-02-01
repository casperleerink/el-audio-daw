import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";

import { Button } from "@/components/ui/button";
import { cancelUploadsForTrack } from "@/lib/uploadRegistry";

interface TrackDeleteButtonProps {
  trackId: string;
}

export function TrackDeleteButton({ trackId }: TrackDeleteButtonProps) {
  const z = useZero();

  const handleDelete = useCallback(() => {
    cancelUploadsForTrack(trackId);
    z.mutate(mutators.tracks.delete({ id: trackId }));
  }, [z, trackId]);

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
