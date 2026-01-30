import { useEffect, useRef } from "react";
import type { AudioEngine, MeterValue } from "@el-audio-daw/audio";

export type { MeterValue };

type MeterListener = (value: MeterValue) => void;

interface MeterContextValue {
  subscribe: (source: string, callback: MeterListener) => () => void;
}

/**
 * Hook for subscribing to meter updates from the audio engine.
 * Uses refs to avoid React re-renders - meter values are pushed
 * directly to subscribers for efficient real-time updates.
 */
export function useMeterValues(engine: AudioEngine | null): MeterContextValue {
  const metersRef = useRef<Map<string, MeterValue>>(new Map());
  const listenersRef = useRef<Map<string, MeterListener>>(new Map());

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.onMeterUpdate((meters) => {
      metersRef.current = meters;

      // Notify per-source listeners
      for (const [source, value] of meters) {
        const listener = listenersRef.current.get(source);
        if (listener) {
          listener(value);
        }
      }
    });

    return unsubscribe;
  }, [engine]);

  // Subscribe a specific meter source (e.g., "track-123-L")
  const subscribe = (source: string, callback: MeterListener): (() => void) => {
    listenersRef.current.set(source, callback);
    return () => {
      listenersRef.current.delete(source);
    };
  };

  return { subscribe };
}
