import type { Zero } from "@rocicorp/zero";
import { mutators } from "@el-audio-daw/zero/mutators";
import { compoundCommand } from "@/commands/compoundCommand";
import { createClipCommand, deleteClipCommand, type ClipSnapshot } from "@/commands/clipCommands";
import type { UndoCommand } from "@/commands/types";
import {
  planDuplicateClips,
  planMoveClips,
  planPasteClips,
  planSplitClips,
  planTrimClip,
  type ClipboardTimelineClip,
  type TimelineEditBlockedReason,
  type TimelineEditClip,
  type TimelineEditOperation,
  type TimelineEditPlan,
  type TimelineEditTrack,
} from "./planTimelineEdit";

export type TimelineEditSelectionEffect = "preserve" | "clear";

export type TimelineEditResult =
  | { status: "ok"; changed: boolean; selectionEffect: TimelineEditSelectionEffect }
  | { status: "blocked"; reason: TimelineEditBlockedReason };

export type TimelineEditStateClip = {
  id?: string;
  _id?: string;
  projectId?: string;
  trackId: string;
  sampleId: string;
  name: string;
  startSampleFrame: number;
  durationSampleFrames: number;
  sourceStartSampleFrame: number;
  gain?: number | null;
};

export type TimelineEditStateTrack = {
  id?: string;
  _id?: string;
};

export type TimelineEditIntent =
  | {
      type: "move-clips";
      draggedClipId: string;
      requestedTrackId: string;
      requestedStartSampleFrame: number;
    }
  | {
      type: "duplicate-clips";
      draggedClipId: string;
      requestedTrackId: string;
      requestedStartSampleFrame: number;
    }
  | {
      type: "trim-clip";
      clipId: string;
      edge: "left" | "right";
      requestedStartSampleFrame: number;
      requestedDurationSampleFrames: number;
      sampleDurationSampleFrames: number | undefined;
    }
  | {
      type: "paste-clips-at-sample-frame";
      sourceTrackId: string;
      clipboardClips: readonly ClipboardTimelineClip[];
      playheadSampleFrame: number;
    }
  | {
      type: "paste-clips-at-playhead";
      sourceTrackId: string;
      clipboardClips: readonly ClipboardTimelineClip[];
      playheadTime: number;
      sampleRate: number;
    }
  | {
      type: "split-clips-at-sample-frame";
      playheadSampleFrame: number;
    }
  | {
      type: "split-clips-at-playhead";
      playheadTime: number;
      sampleRate: number;
    }
  | { type: "delete-selected-clips" };

export type ExecuteTimelineEditInput = {
  z: Zero;
  projectId: string;
  clips: readonly TimelineEditStateClip[];
  tracks?: readonly TimelineEditStateTrack[];
  selectedClipIds?: ReadonlySet<string>;
  intent: TimelineEditIntent;
  pushUndo: (command: UndoCommand) => void;
  createId?: () => string;
};

export async function executeTimelineEdit(
  input: ExecuteTimelineEditInput,
): Promise<TimelineEditResult> {
  const createId = input.createId ?? (() => crypto.randomUUID());
  const clips = toTimelineEditClips(input.clips, input.projectId);
  const tracks = input.tracks ? toTimelineEditTracks(input.tracks) : [];
  const selectedClipIds = input.selectedClipIds ?? new Set<string>();

  const planned = planTimelineEdit({ ...input, clips, tracks, selectedClipIds, createId });
  if (planned.plan.status === "blocked") return planned.plan;

  if (planned.plan.operations.length === 0) {
    return { status: "ok", changed: false, selectionEffect: planned.selectionEffect };
  }

  const command = timelineEditPlanCommand(input.z, planned.label, planned.plan);
  await command.execute();
  input.pushUndo(command);

  return { status: "ok", changed: true, selectionEffect: planned.selectionEffect };
}

function planTimelineEdit(input: {
  projectId: string;
  clips: readonly TimelineEditClip[];
  tracks: readonly TimelineEditTrack[];
  selectedClipIds: ReadonlySet<string>;
  intent: TimelineEditIntent;
  createId: () => string;
}): {
  label: string;
  selectionEffect: TimelineEditSelectionEffect;
  plan: TimelineEditPlan;
} {
  const { projectId, clips, tracks, selectedClipIds, intent, createId } = input;

  if (intent.type === "move-clips") {
    return {
      label: "Move Clip",
      selectionEffect: "preserve",
      plan: planMoveClips({
        clips,
        tracks,
        selectedClipIds,
        draggedClipId: intent.draggedClipId,
        requestedTrackId: intent.requestedTrackId,
        requestedStartSampleFrame: intent.requestedStartSampleFrame,
      }),
    };
  }

  if (intent.type === "duplicate-clips") {
    return {
      label: "Duplicate Clip",
      selectionEffect: "preserve",
      plan: planDuplicateClips({
        clips,
        tracks,
        selectedClipIds,
        draggedClipId: intent.draggedClipId,
        requestedTrackId: intent.requestedTrackId,
        requestedStartSampleFrame: intent.requestedStartSampleFrame,
        projectId,
        createId,
      }),
    };
  }

  if (intent.type === "trim-clip") {
    return {
      label: "Trim Clip",
      selectionEffect: "preserve",
      plan: planTrimClip({
        clips,
        clipId: intent.clipId,
        edge: intent.edge,
        requestedStartSampleFrame: intent.requestedStartSampleFrame,
        requestedDurationSampleFrames: intent.requestedDurationSampleFrames,
        sampleDurationSampleFrames: intent.sampleDurationSampleFrames,
      }),
    };
  }

  if (intent.type === "paste-clips-at-sample-frame") {
    return {
      label: "Paste Clips",
      selectionEffect: "preserve",
      plan: planPasteClips({
        projectId,
        clips,
        sourceTrackId: intent.sourceTrackId,
        clipboardClips: intent.clipboardClips,
        playheadSampleFrame: intent.playheadSampleFrame,
        createId,
      }),
    };
  }

  if (intent.type === "paste-clips-at-playhead") {
    return planTimelineEdit({
      ...input,
      intent: {
        type: "paste-clips-at-sample-frame",
        sourceTrackId: intent.sourceTrackId,
        clipboardClips: intent.clipboardClips,
        playheadSampleFrame: Math.round(intent.playheadTime * intent.sampleRate),
      },
    });
  }

  if (intent.type === "split-clips-at-sample-frame") {
    return {
      label: "Split Clips",
      selectionEffect: "clear",
      plan: planSplitClips({
        clips,
        selectedClipIds,
        projectId,
        playheadSampleFrame: intent.playheadSampleFrame,
        createId,
      }),
    };
  }

  if (intent.type === "split-clips-at-playhead") {
    return planTimelineEdit({
      ...input,
      intent: {
        type: "split-clips-at-sample-frame",
        playheadSampleFrame: Math.round(intent.playheadTime * intent.sampleRate),
      },
    });
  }

  return {
    label: selectedClipIds.size === 1 ? "Delete Clip" : `Delete ${selectedClipIds.size} Clips`,
    selectionEffect: "clear",
    plan: {
      status: "ok",
      operations: clips
        .filter((clip) => selectedClipIds.has(clip.id))
        .map((clip) => ({ type: "deleteClip", clip })),
    },
  };
}

function timelineEditPlanCommand(
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

function toTimelineEditClips(
  clips: readonly TimelineEditStateClip[],
  projectId: string,
): TimelineEditClip[] {
  return clips.map((clip) => ({
    id: getRequiredId(clip, "Clip"),
    projectId: clip.projectId ?? projectId,
    trackId: clip.trackId,
    sampleId: clip.sampleId,
    name: clip.name,
    startSampleFrame: clip.startSampleFrame,
    durationSampleFrames: clip.durationSampleFrames,
    sourceStartSampleFrame: clip.sourceStartSampleFrame,
    gain: clip.gain ?? 0,
  }));
}

function toTimelineEditTracks(tracks: readonly TimelineEditStateTrack[]): TimelineEditTrack[] {
  return tracks.map((track) => ({ id: getRequiredId(track, "Track") }));
}

function getRequiredId(item: { id?: string; _id?: string }, label: string): string {
  const id = item.id ?? item._id;
  if (!id) throw new Error(`${label} is missing id`);
  return id;
}
