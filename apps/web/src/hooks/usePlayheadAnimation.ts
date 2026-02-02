import { useEffect, useRef } from "react";
import { useAudioStore } from "@/stores/audioStore";
import { renderDynamicLayer } from "@/lib/canvasRenderer";

interface UsePlayheadAnimationOptions {
  dynamicCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPlaying: boolean;
  scrollLeft: number;
  pixelsPerSecond: number;
  dimensions: { width: number; height: number };
  rulerHeight: number;
  /** Ref to hover X position (updated directly without React state for performance) */
  hoverXRef: React.RefObject<number | null>;
  /** Ref to hover time in seconds (updated directly without React state for performance) */
  hoverTimeRef: React.RefObject<number | null>;
}

/**
 * Hook for RAF-based playhead animation that bypasses React state
 * Subscribes directly to engine playhead updates via ref for performance
 */
export function usePlayheadAnimation({
  dynamicCanvasRef,
  isPlaying,
  scrollLeft,
  pixelsPerSecond,
  dimensions,
  rulerHeight,
  hoverXRef,
  hoverTimeRef,
}: UsePlayheadAnimationOptions): void {
  const playheadTimeRef = useRef(0);
  const isEngineReady = useAudioStore((s) => s.isEngineReady);

  // Subscribe to engine playhead updates directly (bypass Zustand state)
  useEffect(() => {
    if (!isEngineReady) return;

    const unsubscribe = useAudioStore.getState().onPlayheadUpdate((time) => {
      playheadTimeRef.current = time;
    });

    return unsubscribe;
  }, [isEngineReady]);

  // Sync ref with Zustand state for initial value and seek operations
  useEffect(() => {
    const unsubscribe = useAudioStore.subscribe((state) => {
      playheadTimeRef.current = state.playheadTime;
    });
    // Initialize with current value
    playheadTimeRef.current = useAudioStore.getState().playheadTime;
    return unsubscribe;
  }, []);

  // RAF loop for dynamic layer
  // Always runs to read refs (hoverX/hoverTime updated without React state)
  useEffect(() => {
    const canvas = dynamicCanvasRef.current;
    if (!canvas) return;

    let animationId: number;
    let lastHoverX: number | null = null;
    let lastPlayheadTime = 0;

    const animate = () => {
      const currentHoverX = hoverXRef.current;
      const currentHoverTime = hoverTimeRef.current;
      const currentPlayheadTime = playheadTimeRef.current;

      // Only render if something changed or if playing
      const hoverChanged = currentHoverX !== lastHoverX;
      const playheadChanged = currentPlayheadTime !== lastPlayheadTime;

      if (isPlaying || hoverChanged || playheadChanged) {
        renderDynamicLayer({
          canvas,
          dimensions,
          scrollLeft,
          pixelsPerSecond,
          rulerHeight,
          playheadTime: currentPlayheadTime,
          hoverX: currentHoverX,
          hoverTime: currentHoverTime,
        });
        lastHoverX = currentHoverX;
        lastPlayheadTime = currentPlayheadTime;
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initial render
    renderDynamicLayer({
      canvas,
      dimensions,
      scrollLeft,
      pixelsPerSecond,
      rulerHeight,
      playheadTime: playheadTimeRef.current,
      hoverX: hoverXRef.current,
      hoverTime: hoverTimeRef.current,
    });

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [
    dynamicCanvasRef,
    isPlaying,
    scrollLeft,
    pixelsPerSecond,
    dimensions,
    rulerHeight,
    hoverXRef,
    hoverTimeRef,
  ]);
}
