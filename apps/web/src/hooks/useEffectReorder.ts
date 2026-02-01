import { useCallback, useState } from "react";

interface Effect {
  _id: string;
  order: number;
}

interface UseEffectReorderOptions {
  effects: Effect[];
  onReorder: (effectId: string, newOrder: number) => void;
}

export function useEffectReorder({ effects, onReorder }: UseEffectReorderOptions) {
  const [draggedEffectId, setDraggedEffectId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, effectId: string) => {
    setDraggedEffectId(effectId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", effectId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEffectId(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedEffectId === null) return;

      const draggedEffect = effects.find((eff) => eff._id === draggedEffectId);
      if (!draggedEffect) return;

      // Calculate drop position based on mouse position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const dropIndex = e.clientX < midpoint ? index : index + 1;

      setDropTargetIndex(dropIndex);
    },
    [draggedEffectId, effects],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedEffectId === null || dropTargetIndex === null) return;

      const draggedEffect = effects.find((eff) => eff._id === draggedEffectId);
      if (!draggedEffect) return;

      // Calculate actual new order
      let newOrder = dropTargetIndex;
      if (draggedEffect.order < dropTargetIndex) {
        newOrder = dropTargetIndex - 1;
      }

      if (newOrder !== draggedEffect.order) {
        onReorder(draggedEffectId, newOrder);
      }

      setDraggedEffectId(null);
      setDropTargetIndex(null);
    },
    [draggedEffectId, dropTargetIndex, effects, onReorder],
  );

  return {
    draggedEffectId,
    dropTargetIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
