import { useEffect, useRef, useCallback } from "react";
import type { MeterValue } from "@el-audio-daw/audio";
import { useAudioStore } from "@/stores/audioStore";

type MeterListener = (value: MeterValue) => void;

/**
 * Hook that provides per-source meter subscriptions.
 * Bridges the store's batch meter updates to individual source callbacks
 * for efficient component-level subscriptions.
 */
export function useMeterSubscription() {
  const listenersRef = useRef<Map<string, MeterListener>>(new Map());
  const isEngineReady = useAudioStore((s) => s.isEngineReady);
  const onMeterUpdate = useAudioStore((s) => s.onMeterUpdate);

  useEffect(() => {
    if (!isEngineReady) return;

    const unsubscribe = onMeterUpdate((meters) => {
      // Notify per-source listeners
      for (const [source, value] of meters) {
        const listener = listenersRef.current.get(source);
        if (listener) {
          listener(value);
        }
      }
    });

    return unsubscribe;
  }, [isEngineReady, onMeterUpdate]);

  // Subscribe a specific meter source (e.g., "track-123-L")
  const subscribe = useCallback((source: string, callback: MeterListener): (() => void) => {
    listenersRef.current.set(source, callback);
    return () => {
      listenersRef.current.delete(source);
    };
  }, []);

  return { subscribe };
}
