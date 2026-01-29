import { useCallback, useState } from "react";

interface UseTimelineCanvasEventsOptions {
  /** Canvas element ref for position calculations */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Horizontal scroll position in pixels */
  scrollLeft: number;
  /** Vertical scroll position in pixels */
  scrollTop: number;
  /** Set horizontal scroll position */
  setScrollLeft: React.Dispatch<React.SetStateAction<number>>;
  /** Max vertical scroll position */
  maxScrollTop: number;
  /** Zoom level in pixels per second */
  pixelsPerSecond: number;
  /** Callback when vertical scroll changes */
  onScrollChange: (scrollTop: number) => void;
  /** Callback when seeking to a time position */
  onSeek: (time: number) => void | Promise<void>;
  /** Handle wheel zoom (ctrl/cmd + scroll). Returns true if handled. */
  handleWheelZoom: (e: React.WheelEvent, cursorX: number) => boolean;
  /** Find clip at a given screen position */
  findClipAtPosition: (clientX: number, clientY: number) => unknown | null;
  /** Whether a clip drag just finished (prevents seeking on drag end) */
  justFinishedDrag: boolean;
  /** Handle clip mouse move during drag */
  handleClipMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Handle clip mouse leave */
  handleClipMouseLeave: () => void;
}

interface UseTimelineCanvasEventsReturn {
  /** Current hover X position relative to canvas (null if not hovering) */
  hoverX: number | null;
  /** Current hover time in seconds (null if not hovering) */
  hoverTime: number | null;
  /** Wheel event handler for zoom and scroll */
  handleWheel: (e: React.WheelEvent) => void;
  /** Click event handler for seeking */
  handleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Mouse move event handler for hover indicator and clip dragging */
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Mouse leave event handler to clear hover state */
  handleMouseLeave: () => void;
}

/**
 * Hook to manage timeline canvas event handlers.
 * Handles wheel scroll/zoom, click-to-seek, and hover state tracking.
 */
export function useTimelineCanvasEvents({
  canvasRef,
  scrollLeft,
  scrollTop,
  setScrollLeft,
  maxScrollTop,
  pixelsPerSecond,
  onScrollChange,
  onSeek,
  handleWheelZoom,
  findClipAtPosition,
  justFinishedDrag,
  handleClipMouseMove,
  handleClipMouseLeave,
}: UseTimelineCanvasEventsOptions): UseTimelineCanvasEventsReturn {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Handle wheel for zoom and scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      // Try zoom first (ctrl/cmd + scroll)
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cursorX = e.clientX - rect.left;
        if (handleWheelZoom(e, cursorX)) {
          return;
        }
      }

      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scroll with shift or horizontal gesture
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setScrollLeft((prev) => Math.max(0, prev + delta));
      } else {
        // Vertical scroll - sync with track list
        const newScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + e.deltaY));
        onScrollChange(newScrollTop);
      }
    },
    [canvasRef, maxScrollTop, scrollTop, onScrollChange, handleWheelZoom, setScrollLeft],
  );

  // Handle click for seeking (only if not ending a clip drag)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Don't seek if we just finished dragging a clip
      if (justFinishedDrag) return;

      // Don't seek if clicking on a clip (so users can click clips without seeking)
      const clip = findClipAtPosition(e.clientX, e.clientY);
      if (clip) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [canvasRef, scrollLeft, pixelsPerSecond, onSeek, findClipAtPosition, justFinishedDrag],
  );

  // Handle mouse move for hover indicator and clip dragging
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Handle clip dragging if active
      handleClipMouseMove(e);

      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      setHoverX(canvasX);
      setHoverTime(Math.max(0, time));
    },
    [canvasRef, scrollLeft, pixelsPerSecond, handleClipMouseMove],
  );

  // Handle mouse leave to clear hover state and end clip drag
  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setHoverTime(null);
    handleClipMouseLeave();
  }, [handleClipMouseLeave]);

  return {
    hoverX,
    hoverTime,
    handleWheel,
    handleClick,
    handleMouseMove,
    handleMouseLeave,
  };
}
