import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface TrimState {
  clipId: string;
  edge: "left" | "right";
  originalStartTime: number;
  originalAudioStartTime: number;
  originalDuration: number;
  audioDuration: number;
  currentStartTime: number;
  currentDuration: number;
}

interface UseKonvaClipTrimOptions {
  pixelsPerSecond: number;
  sampleRate: number;
  trimClip: (args: {
    id: string;
    startTime: number;
    audioStartTime: number;
    duration: number;
  }) => Promise<unknown>;
  getAudioFileDuration?: (audioFileId: string) => number | undefined;
}

export function useKonvaClipTrim({
  pixelsPerSecond,
  sampleRate,
  trimClip,
  getAudioFileDuration,
}: UseKonvaClipTrimOptions) {
  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const justFinishedTrimRef = useRef(false);

  const handleTrimStart = useCallback(
    (
      clipId: string,
      edge: "left" | "right",
      startTime: number,
      audioStartTime: number,
      duration: number,
      audioFileId: string,
    ) => {
      justFinishedTrimRef.current = false;
      const audioDuration = getAudioFileDuration?.(audioFileId) ?? duration;
      setTrimState({
        clipId,
        edge,
        originalStartTime: startTime,
        originalAudioStartTime: audioStartTime,
        originalDuration: duration,
        audioDuration,
        currentStartTime: startTime,
        currentDuration: duration,
      });
    },
    [getAudioFileDuration],
  );

  const handleTrimMove = useCallback(
    (deltaXPixels: number, clipId: string) => {
      setTrimState((prev) => {
        if (!prev || prev.clipId !== clipId) return prev;

        const deltaSamples = Math.round(
          (deltaXPixels / pixelsPerSecond) * sampleRate,
        );

        if (prev.edge === "left") {
          // Left trim: adjust startTime + audioStartTime, decrease duration
          let newAudioStartTime = prev.originalAudioStartTime + deltaSamples;
          let newStartTime = prev.originalStartTime + deltaSamples;
          let newDuration = prev.originalDuration - deltaSamples;

          // Constraints
          if (newAudioStartTime < 0) {
            const correction = -newAudioStartTime;
            newAudioStartTime = 0;
            newStartTime += correction;
            newDuration -= correction;
          }
          if (newStartTime < 0) {
            const correction = -newStartTime;
            newStartTime = 0;
            newDuration -= correction;
          }
          if (newDuration < 1) {
            newDuration = 1;
          }

          return {
            ...prev,
            currentStartTime: newStartTime,
            currentDuration: newDuration,
          };
        } else {
          // Right trim: adjust duration only
          let newDuration = prev.originalDuration + deltaSamples;
          const maxDuration = prev.audioDuration - prev.originalAudioStartTime;
          newDuration = Math.min(newDuration, maxDuration);
          newDuration = Math.max(1, newDuration);

          return { ...prev, currentDuration: newDuration };
        }
      });
    },
    [pixelsPerSecond, sampleRate],
  );

  const handleTrimEnd = useCallback(
    async (clipId: string) => {
      justFinishedTrimRef.current = true;
      setTimeout(() => {
        justFinishedTrimRef.current = false;
      }, 50);

      const state = trimState;
      if (!state || state.clipId !== clipId) {
        setTrimState(null);
        return;
      }

      setTrimState(null);

      try {
        // Calculate final audioStartTime from the delta
        const deltaSamples = state.currentStartTime - state.originalStartTime;
        const finalAudioStartTime = state.originalAudioStartTime + deltaSamples;

        await trimClip({
          id: clipId,
          startTime: state.currentStartTime,
          audioStartTime: Math.max(0, finalAudioStartTime),
          duration: state.currentDuration,
        });
      } catch {
        toast.error("Failed to trim clip");
      }
    },
    [trimState, trimClip],
  );

  return {
    trimState,
    justFinishedTrim: justFinishedTrimRef.current,
    handleTrimStart,
    handleTrimMove,
    handleTrimEnd,
  };
}
