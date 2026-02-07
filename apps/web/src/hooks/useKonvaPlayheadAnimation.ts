import { useEffect, useRef } from "react";
import type Konva from "konva";
import { useAudioStore } from "@/stores/audioStore";

interface UseKonvaPlayheadAnimationOptions {
  dynamicLayerRef: React.RefObject<Konva.Layer | null>;
  isPlaying: boolean;
  hoverXRef: React.RefObject<number | null>;
  hoverTimeRef: React.RefObject<number | null>;
}

/**
 * RAF-based animation hook for the dynamic Konva layer.
 * Updates playhead position ref and triggers batchDraw on the dynamic layer.
 * Returns playheadTimeRef so Playhead component can read it.
 */
export function useKonvaPlayheadAnimation({
  dynamicLayerRef,
  isPlaying,
  hoverXRef,
  hoverTimeRef,
}: UseKonvaPlayheadAnimationOptions) {
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
    playheadTimeRef.current = useAudioStore.getState().playheadTime;
    return unsubscribe;
  }, []);

  // RAF loop — triggers batchDraw on the dynamic layer
  useEffect(() => {
    const layer = dynamicLayerRef.current;
    if (!layer) return;

    let animationId: number;
    let lastHoverX: number | null = null;
    let lastPlayheadTime = 0;

    const animate = () => {
      const currentHoverX = hoverXRef.current;
      const currentPlayheadTime = playheadTimeRef.current;

      const hoverChanged = currentHoverX !== lastHoverX;
      const playheadChanged = currentPlayheadTime !== lastPlayheadTime;

      if (isPlaying || hoverChanged || playheadChanged) {
        layer.batchDraw();
        lastHoverX = currentHoverX;
        lastPlayheadTime = currentPlayheadTime;
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initial draw
    layer.batchDraw();
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [dynamicLayerRef, isPlaying, hoverXRef, hoverTimeRef]);

  return { playheadTimeRef };
}
