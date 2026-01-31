import { useCallback } from "react";

interface UseClipMouseHandlersOptions {
  /** Handle trim mouse down - returns true if trim was initiated */
  handleTrimMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => boolean;
  /** Handle trim mouse move */
  handleTrimMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Handle trim mouse up */
  handleTrimMouseUp: () => Promise<void>;
  /** Handle trim mouse leave */
  handleTrimMouseLeave: () => void;
  /** Handle drag mouse down */
  handleDragMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Handle drag mouse move */
  handleDragMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Handle drag mouse up */
  handleDragMouseUp: () => Promise<void>;
  /** Handle drag mouse leave */
  handleDragMouseLeave: () => void;
  /** Whether trim drag just finished */
  justFinishedTrimDrag: boolean;
  /** Whether move drag just finished */
  justFinishedMoveDrag: boolean;
}

interface UseClipMouseHandlersReturn {
  /** Combined mouse down handler - tries trim first, then drag */
  handleClipMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Combined mouse move handler */
  handleClipMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Combined mouse up handler */
  handleClipMouseUp: () => Promise<void>;
  /** Combined mouse leave handler */
  handleClipMouseLeave: () => void;
  /** Whether any clip drag (trim or move) just finished */
  justFinishedDrag: boolean;
}

/**
 * Hook to coordinate mouse handlers for clip trim and drag operations.
 * Combines trim and drag handlers into unified handlers that can be
 * attached to the canvas element.
 *
 * Priority: Trim operations (left/right handles) take precedence over
 * drag operations (body movement).
 */
export function useClipMouseHandlers({
  handleTrimMouseDown,
  handleTrimMouseMove,
  handleTrimMouseUp,
  handleTrimMouseLeave,
  handleDragMouseDown,
  handleDragMouseMove,
  handleDragMouseUp,
  handleDragMouseLeave,
  justFinishedTrimDrag,
  justFinishedMoveDrag,
}: UseClipMouseHandlersOptions): UseClipMouseHandlersReturn {
  // Combined mouse down: try trim first, then drag
  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Try trim first (handles left/right zones)
      if (handleTrimMouseDown(e)) return;
      // Otherwise try drag (handles body zone)
      handleDragMouseDown(e);
    },
    [handleTrimMouseDown, handleDragMouseDown],
  );

  // Combined mouse move: run both handlers
  const handleClipMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleTrimMouseMove(e);
      handleDragMouseMove(e);
    },
    [handleTrimMouseMove, handleDragMouseMove],
  );

  // Combined mouse up: run both handlers
  const handleClipMouseUp = useCallback(async () => {
    await handleTrimMouseUp();
    await handleDragMouseUp();
  }, [handleTrimMouseUp, handleDragMouseUp]);

  // Combined mouse leave: run both handlers
  const handleClipMouseLeave = useCallback(() => {
    handleTrimMouseLeave();
    handleDragMouseLeave();
  }, [handleTrimMouseLeave, handleDragMouseLeave]);

  // Combine justFinishedDrag from both hooks
  const justFinishedDrag = justFinishedMoveDrag || justFinishedTrimDrag;

  return {
    handleClipMouseDown,
    handleClipMouseMove,
    handleClipMouseUp,
    handleClipMouseLeave,
    justFinishedDrag,
  };
}
