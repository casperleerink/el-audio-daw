import { useCallback, useState } from "react";

interface UseTrackReorderOptions {
  trackIds: string[];
  onReorder: (trackIds: string[]) => void;
}

interface UseTrackReorderReturn {
  draggedTrackId: string | null;
  dropTargetIndex: number | null;
  handleDragStart: (e: React.DragEvent, trackId: string) => void;
  handleDragEnd: () => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDrop: (e: React.DragEvent) => void;
}

export function useTrackReorder({
  trackIds,
  onReorder,
}: UseTrackReorderOptions): UseTrackReorderReturn {
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, trackId: string) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", trackId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTrackId(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // Calculate if we're in the top or bottom half of the track
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertIndex = e.clientY < midpoint ? index : index + 1;

    setDropTargetIndex(insertIndex);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      if (draggedTrackId === null || dropTargetIndex === null) return;

      const draggedIndex = trackIds.indexOf(draggedTrackId);
      if (draggedIndex === -1) return;

      // Don't do anything if dropping in the same position
      if (dropTargetIndex === draggedIndex || dropTargetIndex === draggedIndex + 1) {
        setDraggedTrackId(null);
        setDropTargetIndex(null);
        return;
      }

      // Build new order of track IDs
      const newTrackIds = [...trackIds];
      const [removed] = newTrackIds.splice(draggedIndex, 1);
      if (!removed) return;

      // Adjust target index if we removed an item before it
      const adjustedIndex = dropTargetIndex > draggedIndex ? dropTargetIndex - 1 : dropTargetIndex;
      newTrackIds.splice(adjustedIndex, 0, removed);

      onReorder(newTrackIds);
      setDraggedTrackId(null);
      setDropTargetIndex(null);
    },
    [draggedTrackId, dropTargetIndex, trackIds, onReorder],
  );

  return {
    draggedTrackId,
    dropTargetIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
