import type { Zero } from "@rocicorp/zero";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { UndoCommand } from "./types";
import { compoundCommand } from "./compoundCommand";
import type { ClipSnapshot } from "./clipCommands";

interface TrackSnapshot {
  id: string;
  projectId: string;
  name: string;
  order: number;
  color?: string | null;
}

export function createTrackCommand(z: Zero, track: TrackSnapshot): UndoCommand {
  return {
    label: "Create Track",
    execute: async () => {
      await z.mutate(
        mutators.tracks.create({
          id: track.id,
          projectId: track.projectId,
          name: track.name,
          order: track.order,
          ...(track.color != null ? { color: track.color } : {}),
        }),
      );
    },
    undo: async () => {
      await z.mutate(mutators.tracks.delete({ id: track.id }));
    },
  };
}

export function deleteTrackCommand(z: Zero, track: TrackSnapshot, clips: ClipSnapshot[]): UndoCommand {
  const subCommands: UndoCommand[] = [
    // Delete clips first, then track
    ...clips.map(
      (clip): UndoCommand => ({
        label: "Delete Clip",
        execute: async () => {
          await z.mutate(mutators.clips.delete({ id: clip.id }));
        },
        undo: async () => {
          await z.mutate(mutators.clips.create(clip));
        },
      }),
    ),
    {
      label: "Delete Track",
      execute: async () => {
        await z.mutate(mutators.tracks.delete({ id: track.id }));
      },
      undo: async () => {
        await z.mutate(
          mutators.tracks.create({
            id: track.id,
            projectId: track.projectId,
            name: track.name,
            order: track.order,
            ...(track.color != null ? { color: track.color } : {}),
          }),
        );
      },
    },
  ];

  return compoundCommand("Delete Track", subCommands);
  // compound undo runs in reverse: recreate track first, then recreate clips
}

export function reorderTracksCommand(
  z: Zero,
  projectId: string,
  beforeTrackIds: string[],
  afterTrackIds: string[],
): UndoCommand {
  return {
    label: "Reorder Tracks",
    execute: async () => {
      await z.mutate(mutators.tracks.reorder({ projectId, trackIds: afterTrackIds }));
    },
    undo: async () => {
      await z.mutate(mutators.tracks.reorder({ projectId, trackIds: beforeTrackIds }));
    },
  };
}
