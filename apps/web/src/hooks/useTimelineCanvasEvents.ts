import { useCallback, useEffect, useState } from "react";

/** Clip data with trackId for selection */
interface ClipWithTrack {
  _id: string;
  trackId: string;
  pending?: boolean;
}

interface UseTimelineCanvasEventsOptions {
  /** Container element ref for wheel event attachment */
  containerRef: React.RefObject<HTMLDivElement | null>;
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
  findClipAtPosition: (clientX: number, clientY: number) => ClipWithTrack | null;
  /** Whether a clip drag just finished (prevents seeking on drag end) */
  justFinishedDrag: boolean;
  /** Handle clip mouse move during drag */
  handleClipMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  /** Handle clip mouse leave */
  handleClipMouseLeave: () => void;
  /** Callback for single-click selection (FR-1) */
  onSelectClip?: (clipId: string, trackId: string) => void;
  /** Callback for shift-click multi-selection (FR-2) */
  onToggleClipSelection?: (clipId: string, trackId: string) => void;
  /** Callback when clicking empty area to clear selection (FR-5) */
  onClearSelection?: () => void;
}

interface UseTimelineCanvasEventsReturn {
  /** Current hover X position relative to canvas (null if not hovering) */
  hoverX: number | null;
  /** Current hover time in seconds (null if not hovering) */
  hoverTime: number | null;
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
  containerRef,
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
  onSelectClip,
  onToggleClipSelection,
  onClearSelection,
}: UseTimelineCanvasEventsOptions): UseTimelineCanvasEventsReturn {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Attach wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Try zoom first (ctrl/cmd + scroll)
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cursorX = e.clientX - rect.left;
        // Create a minimal event-like object for handleWheelZoom
        const wheelEvent = {
          deltaY: e.deltaY,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        } as React.WheelEvent;
        if (handleWheelZoom(wheelEvent, cursorX)) {
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
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [
    containerRef,
    canvasRef,
    maxScrollTop,
    scrollTop,
    onScrollChange,
    handleWheelZoom,
    setScrollLeft,
  ]);

  // Handle click for seeking and selection
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Don't seek if we just finished dragging a clip
      if (justFinishedDrag) return;

      // Check if clicking on a clip
      const clip = findClipAtPosition(e.clientX, e.clientY);

      if (clip) {
        // FR-8: Pending clips cannot be selected
        if (clip.pending) return;

        // FR-2: Shift+click toggles selection
        if (e.shiftKey) {
          onToggleClipSelection?.(clip._id, clip.trackId);
        } else {
          // FR-1: Click selects clip and deselects others
          onSelectClip?.(clip._id, clip.trackId);
        }
        return;
      }

      // FR-5: Click on empty area deselects all clips
      onClearSelection?.();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [
      canvasRef,
      scrollLeft,
      pixelsPerSecond,
      onSeek,
      findClipAtPosition,
      justFinishedDrag,
      onSelectClip,
      onToggleClipSelection,
      onClearSelection,
    ],
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
    handleClick,
    handleMouseMove,
    handleMouseLeave,
  };
}
