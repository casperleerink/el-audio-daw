import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
} from "@/lib/timelineConstants";

// Safari-specific GestureEvent for trackpad pinch-to-zoom
interface GestureEvent extends UIEvent {
  scale: number;
  rotation: number;
}

interface UseTimelineZoomOptions {
  /** Container element ref for gesture event listeners */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Canvas element ref for getBoundingClientRect calculations */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Current hover X position (null if not hovering) */
  hoverX: number | null;
  /** Viewport dimensions */
  dimensions: { width: number; height: number };
}

interface UseTimelineZoomReturn {
  /** Horizontal scroll position in pixels */
  scrollLeft: number;
  /** Zoom level in pixels per second */
  pixelsPerSecond: number;
  /** Set horizontal scroll position */
  setScrollLeft: React.Dispatch<React.SetStateAction<number>>;
  /** Whether zoom in is available */
  canZoomIn: boolean;
  /** Whether zoom out is available */
  canZoomOut: boolean;
  /** Handle zoom in button click */
  handleZoomIn: () => void;
  /** Handle zoom out button click */
  handleZoomOut: () => void;
  /**
   * Handle wheel zoom (ctrl/cmd + scroll).
   * Returns true if zoom was handled, false if event should be handled elsewhere.
   */
  handleWheelZoom: (e: React.WheelEvent, cursorX: number) => boolean;
}

/**
 * Hook to manage timeline zoom state and interactions.
 * Handles zoom via buttons, ctrl/cmd+scroll, and Safari trackpad pinch gestures.
 */
export function useTimelineZoom({
  containerRef,
  hoverX,
  dimensions,
}: UseTimelineZoomOptions): UseTimelineZoomReturn {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);

  // Store current values in refs for Safari gesture handlers
  const scrollLeftRef = useRef(scrollLeft);
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  const hoverXRef = useRef(hoverX);
  const dimensionsRef = useRef(dimensions);

  // Sync refs with state
  useEffect(() => {
    scrollLeftRef.current = scrollLeft;
  }, [scrollLeft]);
  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
  }, [pixelsPerSecond]);
  useEffect(() => {
    hoverXRef.current = hoverX;
  }, [hoverX]);
  useEffect(() => {
    dimensionsRef.current = dimensions;
  }, [dimensions]);

  /**
   * Apply zoom centered on a specific X position.
   */
  const applyZoom = useCallback(
    (
      newPixelsPerSecond: number,
      cursorX: number,
      currentScrollLeft: number,
      currentPPS: number,
    ) => {
      // Calculate time at cursor before zoom
      const timeAtCursor = (cursorX + currentScrollLeft) / currentPPS;

      // Adjust scroll so cursor stays over the same time position
      const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

      setPixelsPerSecond(newPixelsPerSecond);
      setScrollLeft(Math.max(0, newScrollLeft));
    },
    [],
  );

  // Zoom in by 2x, centered on cursor or viewport center
  const handleZoomIn = useCallback(() => {
    const cursorX = hoverX ?? dimensions.width / 2;
    const newPixelsPerSecond = Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond * 2);
    applyZoom(newPixelsPerSecond, cursorX, scrollLeft, pixelsPerSecond);
  }, [hoverX, dimensions.width, scrollLeft, pixelsPerSecond, applyZoom]);

  // Zoom out by 2x, centered on cursor or viewport center
  const handleZoomOut = useCallback(() => {
    const cursorX = hoverX ?? dimensions.width / 2;
    const newPixelsPerSecond = Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond / 2);
    applyZoom(newPixelsPerSecond, cursorX, scrollLeft, pixelsPerSecond);
  }, [hoverX, dimensions.width, scrollLeft, pixelsPerSecond, applyZoom]);

  // Handle wheel zoom (ctrl/cmd + scroll)
  const handleWheelZoom = useCallback(
    (e: React.WheelEvent, cursorX: number): boolean => {
      if (!(e.ctrlKey || e.metaKey)) {
        return false;
      }

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newPixelsPerSecond = Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond * zoomFactor),
      );
      applyZoom(newPixelsPerSecond, cursorX, scrollLeft, pixelsPerSecond);
      return true;
    },
    [pixelsPerSecond, scrollLeft, applyZoom],
  );

  // Prevent browser zoom on Safari trackpad pinch gestures
  // Safari fires gesturestart/gesturechange/gestureend for pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Track gesture scale for Safari pinch-to-zoom
    let lastScale = 1;

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      // GestureEvent is Safari-specific
      const gestureEvent = e as GestureEvent;
      const scale = gestureEvent.scale;
      const zoomFactor = scale / lastScale;
      lastScale = scale;

      // Use cursor position if hovering, otherwise use viewport center
      const cursorX = hoverXRef.current ?? dimensionsRef.current.width / 2;
      const currentScrollLeft = scrollLeftRef.current;
      const currentPPS = pixelsPerSecondRef.current;

      // Calculate time at cursor before zoom
      const timeAtCursor = (cursorX + currentScrollLeft) / currentPPS;

      // Calculate new zoom level
      const newPixelsPerSecond = Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, currentPPS * zoomFactor),
      );

      // Adjust scroll so cursor stays over the same time position
      const newScrollLeft = timeAtCursor * newPixelsPerSecond - cursorX;

      setPixelsPerSecond(newPixelsPerSecond);
      setScrollLeft(Math.max(0, newScrollLeft));
    };

    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    // Add gesture event listeners (Safari only - other browsers ignore these)
    container.addEventListener("gesturestart", handleGestureStart);
    container.addEventListener("gesturechange", handleGestureChange);
    container.addEventListener("gestureend", handleGestureEnd);

    return () => {
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gesturechange", handleGestureChange);
      container.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [containerRef]);

  const canZoomIn = pixelsPerSecond < MAX_PIXELS_PER_SECOND;
  const canZoomOut = pixelsPerSecond > MIN_PIXELS_PER_SECOND;

  return {
    scrollLeft,
    pixelsPerSecond,
    setScrollLeft,
    canZoomIn,
    canZoomOut,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoom,
  };
}
