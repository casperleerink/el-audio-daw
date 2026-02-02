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
  hoverX: number | null;
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
  hoverX,
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

  // RAF loop for dynamic layer (runs when playing OR hovering)
  useEffect(() => {
    const canvas = dynamicCanvasRef.current;
    if (!canvas) return;

    // Always render at least once to clear or show current state
    const renderFrame = () => {
      renderDynamicLayer({
        canvas,
        dimensions,
        scrollLeft,
        pixelsPerSecond,
        rulerHeight,
        playheadTime: playheadTimeRef.current,
        hoverX,
      });
    };

    // If not playing and not hovering, render once and stop
    if (!isPlaying && hoverX === null) {
      renderFrame();
      return;
    }

    // Start animation loop
    let animationId: number;
    const animate = () => {
      renderFrame();
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [dynamicCanvasRef, isPlaying, hoverX, scrollLeft, pixelsPerSecond, dimensions, rulerHeight]);
}
