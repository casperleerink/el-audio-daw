import type { Zero } from "@rocicorp/zero";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { UndoCommand } from "./types";
import { compoundCommand } from "./compoundCommand";

interface ClipPosition {
  trackId: string;
  startSampleFrame: number;
}

interface ClipTrimState {
  startSampleFrame: number;
  sourceStartSampleFrame: number;
  durationSampleFrames: number;
}

export interface ClipSnapshot {
  id: string;
  projectId: string;
  trackId: string;
  sampleId: string;
  name: string;
  startSampleFrame: number;
  durationSampleFrames: number;
  sourceStartSampleFrame: number;
  gain: number;
}

export function moveClipCommand(
  z: Zero,
  clipId: string,
  from: ClipPosition,
  to: ClipPosition,
): UndoCommand {
  return {
    label: "Move Clip",
    execute: async () => {
      const trackChanged = to.trackId !== from.trackId;
      if (trackChanged) {
        await z.mutate(
          mutators.clips.move({
            id: clipId,
            trackId: to.trackId,
            startSampleFrame: to.startSampleFrame,
          }),
        );
      } else {
        await z.mutate(
          mutators.clips.update({ id: clipId, startSampleFrame: to.startSampleFrame }),
        );
      }
    },
    undo: async () => {
      const trackChanged = to.trackId !== from.trackId;
      if (trackChanged) {
        await z.mutate(
          mutators.clips.move({
            id: clipId,
            trackId: from.trackId,
            startSampleFrame: from.startSampleFrame,
          }),
        );
      } else {
        await z.mutate(
          mutators.clips.update({ id: clipId, startSampleFrame: from.startSampleFrame }),
        );
      }
    },
  };
}

export function trimClipCommand(
  z: Zero,
  clipId: string,
  from: ClipTrimState,
  to: ClipTrimState,
): UndoCommand {
  return {
    label: "Trim Clip",
    execute: async () => {
      await z.mutate(
        mutators.clips.update({
          id: clipId,
          startSampleFrame: to.startSampleFrame,
          sourceStartSampleFrame: to.sourceStartSampleFrame,
          durationSampleFrames: to.durationSampleFrames,
        }),
      );
    },
    undo: async () => {
      await z.mutate(
        mutators.clips.update({
          id: clipId,
          startSampleFrame: from.startSampleFrame,
          sourceStartSampleFrame: from.sourceStartSampleFrame,
          durationSampleFrames: from.durationSampleFrames,
        }),
      );
    },
  };
}

export function createClipCommand(z: Zero, clip: ClipSnapshot): UndoCommand {
  return {
    label: "Create Clip",
    execute: async () => {
      await z.mutate(mutators.clips.create(clip));
    },
    undo: async () => {
      await z.mutate(mutators.clips.delete({ id: clip.id }));
    },
  };
}

export function deleteClipCommand(z: Zero, clip: ClipSnapshot): UndoCommand {
  return {
    label: "Delete Clip",
    execute: async () => {
      await z.mutate(mutators.clips.delete({ id: clip.id }));
    },
    undo: async () => {
      await z.mutate(mutators.clips.create(clip));
    },
  };
}

export function deleteClipsCommand(z: Zero, clips: ClipSnapshot[]): UndoCommand {
  if (clips.length === 1) return deleteClipCommand(z, clips[0]!);
  return compoundCommand(
    `Delete ${clips.length} Clips`,
    clips.map((clip) => deleteClipCommand(z, clip)),
  );
}

export function splitClipCommand(
  z: Zero,
  originalBefore: ClipSnapshot,
  originalAfterDuration: number,
  newClip: ClipSnapshot,
): UndoCommand {
  return compoundCommand("Split Clip", [
    {
      label: "Trim Original",
      execute: async () => {
        await z.mutate(
          mutators.clips.update({
            id: originalBefore.id,
            durationSampleFrames: originalAfterDuration,
          }),
        );
      },
      undo: async () => {
        await z.mutate(
          mutators.clips.update({
            id: originalBefore.id,
            durationSampleFrames: originalBefore.durationSampleFrames,
          }),
        );
      },
    },
    createClipCommand(z, newClip),
  ]);
}

export function createClipsCommand(z: Zero, clips: ClipSnapshot[]): UndoCommand {
  if (clips.length === 1) return createClipCommand(z, clips[0]!);
  return compoundCommand(
    `Create ${clips.length} Clips`,
    clips.map((clip) => createClipCommand(z, clip)),
  );
}
