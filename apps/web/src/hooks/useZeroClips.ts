import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { Clip } from "@el-audio-daw/zero/schema";

type CreateClipArgs = {
  projectId: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime?: number;
  gain?: number;
};

type UpdateClipArgs = {
  id: string;
  name?: string;
  startTime?: number;
  duration?: number;
  audioStartTime?: number;
  gain?: number;
};

type MoveClipArgs = {
  id: string;
  trackId: string;
  startTime: number;
};

type PasteClipsArgs = {
  projectId: string;
  trackId: string;
  clips: Array<{
    audioFileId: string;
    name: string;
    startTime: number;
    duration: number;
    audioStartTime: number;
    gain: number;
  }>;
};

type SplitClipArgs = {
  clip: Clip;
  splitTime: number;
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
          audioFileId: args.audioFileId,
          name: args.name,
          startTime: args.startTime,
          duration: args.duration,
          audioStartTime: args.audioStartTime ?? 0,
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
            audioFileId: clip.audioFileId,
            name: clip.name,
            startTime: clip.startTime,
            duration: clip.duration,
            audioStartTime: clip.audioStartTime,
            gain: clip.gain ?? 0,
          }),
        ).client;
      }
      return ids;
    },
    [zero],
  );

  /**
   * Split a clip at the given time.
   * Updates the original clip's duration and creates a new right clip.
   */
  const splitClip = useCallback(
    async (args: SplitClipArgs) => {
      const { clip, splitTime } = args;
      const clipEnd = clip.startTime + clip.duration;

      // Only split if splitTime is within clip bounds
      if (splitTime <= clip.startTime || splitTime >= clipEnd) {
        return null;
      }

      const leftDuration = splitTime - clip.startTime;
      const rightStartTime = splitTime;
      const rightDuration = clipEnd - splitTime;
      const rightAudioStartTime = clip.audioStartTime + leftDuration;

      // Update the left clip (original)
      await zero.mutate(
        mutators.clips.update({
          id: clip.id,
          duration: leftDuration,
        }),
      ).client;

      // Create the right clip
      const rightId = crypto.randomUUID();
      await zero.mutate(
        mutators.clips.create({
          id: rightId,
          projectId: clip.projectId,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: rightStartTime,
          duration: rightDuration,
          audioStartTime: rightAudioStartTime,
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
