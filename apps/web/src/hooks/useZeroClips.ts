import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { Clip } from "@el-audio-daw/zero/schema";

type CreateClipArgs = {
  projectId: string;
  trackId: string;
  sampleId: string;
  name: string;
  startSampleFrame: number;
  durationSampleFrames: number;
  sourceStartSampleFrame?: number;
  gain?: number;
};

type UpdateClipArgs = {
  id: string;
  name?: string;
  startSampleFrame?: number;
  durationSampleFrames?: number;
  sourceStartSampleFrame?: number;
  gain?: number;
};

type MoveClipArgs = {
  id: string;
  trackId: string;
  startSampleFrame: number;
};

type PasteClipsArgs = {
  projectId: string;
  trackId: string;
  clips: Array<{
    sampleId: string;
    name: string;
    startSampleFrame: number;
    durationSampleFrames: number;
    sourceStartSampleFrame: number;
    gain: number;
  }>;
};

type SplitClipArgs = {
  clip: Clip;
  splitSampleFrame: number;
};

/**
 * Hook for managing clips using Zero sync.
 * Provides clip queries and mutations with real-time sync.
 * Zero handles optimistic updates automatically.
 */
export function useZeroClips(projectId: string | undefined) {
  const zero = useZero();
  const [clips] = useQuery(projectId ? queries.clips.byProject({ projectId }) : undefined);

  const createClip = useCallback(
    async (args: CreateClipArgs) => {
      const id = crypto.randomUUID();
      await zero.mutate(
        mutators.clips.create({
          id,
          projectId: args.projectId,
          trackId: args.trackId,
          sampleId: args.sampleId,
          name: args.name,
          startSampleFrame: args.startSampleFrame,
          durationSampleFrames: args.durationSampleFrames,
          sourceStartSampleFrame: args.sourceStartSampleFrame ?? 0,
          gain: args.gain ?? 0,
        }),
      ).client;
      return id;
    },
    [zero],
  );

  const updateClip = useCallback(
    async (args: UpdateClipArgs) => {
      await zero.mutate(mutators.clips.update(args)).client;
    },
    [zero],
  );

  const moveClip = useCallback(
    async (args: MoveClipArgs) => {
      await zero.mutate(mutators.clips.move(args)).client;
    },
    [zero],
  );

  const deleteClip = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.clips.delete({ id })).client;
    },
    [zero],
  );

  /**
   * Paste multiple clips at once.
   * Creates each clip with a new ID.
   */
  const pasteClips = useCallback(
    async (args: PasteClipsArgs) => {
      const ids: string[] = [];
      for (const clip of args.clips) {
        const id = crypto.randomUUID();
        ids.push(id);
        await zero.mutate(
          mutators.clips.create({
            id,
            projectId: args.projectId,
            trackId: args.trackId,
            sampleId: clip.sampleId,
            name: clip.name,
            startSampleFrame: clip.startSampleFrame,
            durationSampleFrames: clip.durationSampleFrames,
            sourceStartSampleFrame: clip.sourceStartSampleFrame,
            gain: clip.gain ?? 0,
          }),
        ).client;
      }
      return ids;
    },
    [zero],
  );

  /**
   * Split a Clip at the given sample frame.
   * Updates the original clip's durationSampleFrames and creates a new right clip.
   */
  const splitClip = useCallback(
    async (args: SplitClipArgs) => {
      const { clip, splitSampleFrame } = args;
      const clipEnd = clip.startSampleFrame + clip.durationSampleFrames;

      // Only split if splitSampleFrame is within clip bounds
      if (splitSampleFrame <= clip.startSampleFrame || splitSampleFrame >= clipEnd) {
        return null;
      }

      const leftDuration = splitSampleFrame - clip.startSampleFrame;
      const rightStartSampleFrame = splitSampleFrame;
      const rightDuration = clipEnd - splitSampleFrame;
      const rightAudioStartTime = clip.sourceStartSampleFrame + leftDuration;

      // Update the left clip (original)
      await zero.mutate(
        mutators.clips.update({
          id: clip.id,
          durationSampleFrames: leftDuration,
        }),
      ).client;

      // Create the right clip
      const rightId = crypto.randomUUID();
      await zero.mutate(
        mutators.clips.create({
          id: rightId,
          projectId: clip.projectId,
          trackId: clip.trackId,
          sampleId: clip.sampleId,
          name: clip.name,
          startSampleFrame: rightStartSampleFrame,
          durationSampleFrames: rightDuration,
          sourceStartSampleFrame: rightAudioStartTime,
          gain: clip.gain ?? 0,
        }),
      ).client;

      return rightId;
    },
    [zero],
  );

  return {
    clips: clips ?? [],
    createClip,
    updateClip,
    moveClip,
    deleteClip,
    pasteClips,
    splitClip,
  };
}
