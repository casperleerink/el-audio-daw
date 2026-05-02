import type { Zero } from "@rocicorp/zero";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { UndoCommand } from "./types";
import { compoundCommand } from "./compoundCommand";
import type { TimelineEditPlan, TimelineEditOperation } from "@/lib/timelineEditIntent";

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

export function timelineEditPlanCommand(
  z: Zero,
  label: string,
  plan: Extract<TimelineEditPlan, { status: "ok" }>,
): UndoCommand {
  const commands = plan.operations.map((operation) => timelineEditOperationCommand(z, operation));
  if (commands.length === 1) return { ...commands[0]!, label };
  return compoundCommand(label, commands);
}

function timelineEditOperationCommand(z: Zero, operation: TimelineEditOperation): UndoCommand {
  if (operation.type === "createClip") return createClipCommand(z, operation.clip);
  if (operation.type === "deleteClip") return deleteClipCommand(z, operation.clip);

  return {
    label: "Update Clip",
    execute: async () => {
      await updateClipFromPlan(z, operation.clipId, operation.before, operation.after);
    },
    undo: async () => {
      await updateClipFromPlan(
        z,
        operation.clipId,
        { ...operation.before, ...operation.after },
        operation.before,
      );
    },
  };
}

async function updateClipFromPlan(
  z: Zero,
  clipId: string,
  before: Pick<ClipSnapshot, "trackId" | "startSampleFrame">,
  after: Partial<
    Pick<
      ClipSnapshot,
      "trackId" | "startSampleFrame" | "sourceStartSampleFrame" | "durationSampleFrames" | "gain"
    >
  >,
): Promise<void> {
  const trackId = after.trackId ?? before.trackId;
  const startSampleFrame = after.startSampleFrame ?? before.startSampleFrame;
  const trackChanged = trackId !== before.trackId;

  if (trackChanged) {
    await z.mutate(mutators.clips.move({ id: clipId, trackId, startSampleFrame }));
  }

  const update = {
    ...(trackChanged ? {} : after.startSampleFrame !== undefined ? { startSampleFrame } : {}),
    ...(after.sourceStartSampleFrame !== undefined
      ? { sourceStartSampleFrame: after.sourceStartSampleFrame }
      : {}),
    ...(after.durationSampleFrames !== undefined
      ? { durationSampleFrames: after.durationSampleFrames }
      : {}),
    ...(after.gain !== undefined ? { gain: after.gain } : {}),
  };

  if (Object.keys(update).length > 0) {
    await z.mutate(mutators.clips.update({ id: clipId, ...update }));
  }
}
