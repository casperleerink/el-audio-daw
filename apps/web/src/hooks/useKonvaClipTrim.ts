import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { Zero } from "@rocicorp/zero";
import { useUndoStore } from "@/stores/undoStore";
import { timelineEditPlanCommand } from "@/commands/clipCommands";
import type { ClipData } from "@/components/project/timeline/types";
import { planTrimClip, type TimelineEditClip } from "@/lib/timelineEditIntent";

interface TrimState {
  clipId: string;
  edge: "left" | "right";
  originalStartSampleFrame: number;
  originalSourceStartSampleFrame: number;
  originalDurationSampleFrames: number;
  sampleDurationFrames: number;
  currentStartSampleFrame: number;
  currentDurationSampleFrames: number;
}

interface UseKonvaClipTrimOptions {
  pixelsPerSecond: number;
  sampleRate: number;
  z: Zero;
  getSampleDuration?: (sampleId: string) => number | undefined;
  clips: ClipData[];
  projectId: string;
}

export function useKonvaClipTrim({
  pixelsPerSecond,
  sampleRate,
  z,
  getSampleDuration,
  clips,
  projectId,
}: UseKonvaClipTrimOptions) {
  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const justFinishedTrimRef = useRef(false);

  const handleTrimStart = useCallback(
    (
      clipId: string,
      edge: "left" | "right",
      startSampleFrame: number,
      sourceStartSampleFrame: number,
      durationSampleFrames: number,
      sampleId: string,
    ) => {
      justFinishedTrimRef.current = false;
      const sampleDurationFrames = getSampleDuration?.(sampleId) ?? durationSampleFrames;
      setTrimState({
        clipId,
        edge,
        originalStartSampleFrame: startSampleFrame,
        originalSourceStartSampleFrame: sourceStartSampleFrame,
        originalDurationSampleFrames: durationSampleFrames,
        sampleDurationFrames,
        currentStartSampleFrame: startSampleFrame,
        currentDurationSampleFrames: durationSampleFrames,
      });
    },
    [getSampleDuration],
  );

  const handleTrimMove = useCallback(
    (deltaXPixels: number, clipId: string) => {
      setTrimState((prev) => {
        if (!prev || prev.clipId !== clipId) return prev;

        const deltaSamples = Math.round((deltaXPixels / pixelsPerSecond) * sampleRate);

        if (prev.edge === "left") {
          // Left trim: adjust startSampleFrame + sourceStartSampleFrame, decrease durationSampleFrames
          let newSourceStartSampleFrame = prev.originalSourceStartSampleFrame + deltaSamples;
          let newStartSampleFrame = prev.originalStartSampleFrame + deltaSamples;
          let newDurationSampleFrames = prev.originalDurationSampleFrames - deltaSamples;

          // Constraints
          if (newSourceStartSampleFrame < 0) {
            const correction = -newSourceStartSampleFrame;
            newSourceStartSampleFrame = 0;
            newStartSampleFrame += correction;
            newDurationSampleFrames -= correction;
          }
          if (newStartSampleFrame < 0) {
            const correction = -newStartSampleFrame;
            newStartSampleFrame = 0;
            newDurationSampleFrames -= correction;
          }
          if (newDurationSampleFrames < 1) {
            newDurationSampleFrames = 1;
          }

          return {
            ...prev,
            currentStartSampleFrame: newStartSampleFrame,
            currentDurationSampleFrames: newDurationSampleFrames,
          };
        } else {
          // Right trim: adjust durationSampleFrames only
          let newDurationSampleFrames = prev.originalDurationSampleFrames + deltaSamples;
          const maxDuration = prev.sampleDurationFrames - prev.originalSourceStartSampleFrame;
          newDurationSampleFrames = Math.min(newDurationSampleFrames, maxDuration);
          newDurationSampleFrames = Math.max(1, newDurationSampleFrames);

          return { ...prev, currentDurationSampleFrames: newDurationSampleFrames };
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
        const plan = planTrimClip({
          clips: toTimelineEditClips(clips, projectId),
          clipId,
          edge: state.edge,
          requestedStartSampleFrame: state.currentStartSampleFrame,
          requestedDurationSampleFrames: state.currentDurationSampleFrames,
          sampleDurationSampleFrames: state.sampleDurationFrames,
        });
        if (plan.status === "blocked") {
          toast.error("No room to trim clip");
          return;
        }
        const cmd = timelineEditPlanCommand(z, "Trim Clip", plan);
        await cmd.execute();
        useUndoStore.getState().push(cmd);
      } catch {
        toast.error("Failed to trim clip");
      }
    },
    [trimState, clips, projectId, z],
  );

  return {
    trimState,
    justFinishedTrim: justFinishedTrimRef.current,
    handleTrimStart,
    handleTrimMove,
    handleTrimEnd,
  };
}

function toTimelineEditClips(clips: ClipData[], projectId: string): TimelineEditClip[] {
  return clips.map((clip) => ({
    id: clip._id,
    projectId,
    trackId: clip.trackId,
    sampleId: clip.sampleId,
    name: clip.name,
    startSampleFrame: clip.startSampleFrame,
    durationSampleFrames: clip.durationSampleFrames,
    sourceStartSampleFrame: clip.sourceStartSampleFrame,
    gain: 0,
  }));
}
