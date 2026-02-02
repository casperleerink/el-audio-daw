import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipHoverZone } from "./useClipDrag";

/** Clip data with trackId for selection */
interface ClipWithTrack {
  _id: string;
  trackId: string;
  pending?: boolean;
}

/** Result from findClipAtPosition including zone information */
interface ClipAtPositionResult {
  clip: ClipWithTrack;
  zone: ClipHoverZone;
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
  /** Find clip at a given screen position - returns clip and hover zone */
  findClipAtPosition: (clientX: number, clientY: number) => ClipAtPositionResult | null;
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
  /** Current hover X position relative to canvas (null if not hovering) - ref for perf */
  hoverXRef: React.RefObject<number | null>;
  /** Current hover time in seconds (null if not hovering) - ref for perf */
  hoverTimeRef: React.RefObject<number | null>;
  /** Currently hovered clip ID (null if not hovering over a clip) */
  hoveredClipId: string | null;
  /** Which zone of the clip is being hovered (FR-14: left/right for trim handles) */
  hoveredClipZone: ClipHoverZone | null;
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
  // Use refs for hoverX/hoverTime to avoid React re-renders on mouse move
  const hoverXRef = useRef<number | null>(null);
  const hoverTimeRef = useRef<number | null>(null);
  // Clip hover state still uses useState since it affects cursor and trim handles
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [hoveredClipZone, setHoveredClipZone] = useState<ClipHoverZone | null>(null);

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
      const result = findClipAtPosition(e.clientX, e.clientY);

      if (result) {
        const { clip } = result;
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

  // Handle mouse move for hover indicator, clip dragging, and trim handle detection (FR-14)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Handle clip dragging if active
      handleClipMouseMove(e);

      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      // Update refs directly (no React state) for performance
      hoverXRef.current = canvasX;
      hoverTimeRef.current = Math.max(0, time);

      // FR-14: Track which clip and zone is being hovered for trim handles
      const result = findClipAtPosition(e.clientX, e.clientY);
      if (result) {
        setHoveredClipId(result.clip._id);
        setHoveredClipZone(result.zone);
      } else {
        setHoveredClipId(null);
        setHoveredClipZone(null);
      }
    },
    [canvasRef, scrollLeft, pixelsPerSecond, handleClipMouseMove, findClipAtPosition],
  );

  // Handle mouse leave to clear hover state and end clip drag
  const handleMouseLeave = useCallback(() => {
    hoverXRef.current = null;
    hoverTimeRef.current = null;
    setHoveredClipId(null);
    setHoveredClipZone(null);
    handleClipMouseLeave();
  }, [handleClipMouseLeave]);

  return {
    hoverXRef,
    hoverTimeRef,
    hoveredClipId,
    hoveredClipZone,
    handleClick,
    handleMouseMove,
    handleMouseLeave,
  };
}
