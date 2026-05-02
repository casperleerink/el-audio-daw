export interface TimelineEditTrack {
  id: string;
}

export interface TimelineEditClip {
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

export interface ClipboardTimelineClip {
  sampleId: string;
  name: string;
  durationSampleFrames: number;
  sourceStartSampleFrame: number;
  gain: number;
  offsetFromFirst: number;
}

export interface ClipSnapshot extends TimelineEditClip {}

export type TimelineEditOperation =
  | { type: "createClip"; clip: ClipSnapshot }
  | {
      type: "updateClip";
      clipId: string;
      before: ClipSnapshot;
      after: Partial<
        Pick<
          TimelineEditClip,
          | "trackId"
          | "startSampleFrame"
          | "sourceStartSampleFrame"
          | "durationSampleFrames"
          | "gain"
        >
      >;
    }
  | { type: "deleteClip"; clip: ClipSnapshot };

export type TimelineEditBlockedReason =
  | "empty-selection"
  | "clip-not-found"
  | "track-not-found"
  | "no-gap-fits"
  | "playhead-outside-clip"
  | "missing-sample-duration";

export type TimelineEditPlan =
  | { status: "ok"; operations: TimelineEditOperation[] }
  | { status: "blocked"; reason: TimelineEditBlockedReason };

interface MoveClipsInput {
  clips: readonly TimelineEditClip[];
  tracks: readonly TimelineEditTrack[];
  selectedClipIds: ReadonlySet<string>;
  draggedClipId: string;
  requestedTrackId: string;
  requestedStartSampleFrame: number;
}

interface DuplicateClipsInput extends MoveClipsInput {
  projectId: string;
  createId: () => string;
}

interface PasteClipsInput {
  projectId: string;
  clips: readonly TimelineEditClip[];
  sourceTrackId: string;
  clipboardClips: readonly ClipboardTimelineClip[];
  playheadSampleFrame: number;
  createId: () => string;
}

interface TrimClipInput {
  clips: readonly TimelineEditClip[];
  clipId: string;
  edge: "left" | "right";
  requestedStartSampleFrame: number;
  requestedDurationSampleFrames: number;
  sampleDurationSampleFrames: number | undefined;
}

interface SplitClipsInput {
  clips: readonly TimelineEditClip[];
  selectedClipIds: ReadonlySet<string>;
  projectId: string;
  playheadSampleFrame: number;
  createId: () => string;
}

type PlannedRange = {
  clip: TimelineEditClip;
  trackId: string;
  startSampleFrame: number;
  durationSampleFrames: number;
};

export function planMoveClips(input: MoveClipsInput): TimelineEditPlan {
  const group = getEditGroup(input.clips, input.selectedClipIds, input.draggedClipId);
  if (group.length === 0) return { status: "blocked", reason: "clip-not-found" };

  const draggedClip = group.find((clip) => clip.id === input.draggedClipId);
  if (!draggedClip) return { status: "blocked", reason: "clip-not-found" };

  const plannedRanges = planMovedRanges(input, group, draggedClip);
  if (!plannedRanges) return { status: "blocked", reason: "track-not-found" };

  const clamped = clampGroupToNearestGap({
    clips: input.clips,
    ignoredClipIds: new Set(group.map((clip) => clip.id)),
    requestedRanges: plannedRanges,
  });
  if (!clamped) return { status: "blocked", reason: "no-gap-fits" };

  const operations = clamped
    .filter(
      (range) =>
        range.clip.trackId !== range.trackId ||
        range.clip.startSampleFrame !== range.startSampleFrame,
    )
    .map(
      (range): TimelineEditOperation => ({
        type: "updateClip",
        clipId: range.clip.id,
        before: range.clip,
        after: { trackId: range.trackId, startSampleFrame: range.startSampleFrame },
      }),
    );

  return { status: "ok", operations };
}

export function planDuplicateClips(input: DuplicateClipsInput): TimelineEditPlan {
  const group = getEditGroup(input.clips, input.selectedClipIds, input.draggedClipId);
  if (group.length === 0) return { status: "blocked", reason: "clip-not-found" };

  const draggedClip = group.find((clip) => clip.id === input.draggedClipId);
  if (!draggedClip) return { status: "blocked", reason: "clip-not-found" };

  const plannedRanges = planMovedRanges(input, group, draggedClip);
  if (!plannedRanges) return { status: "blocked", reason: "track-not-found" };

  const clamped = clampGroupToNearestGap({
    clips: input.clips,
    ignoredClipIds: new Set(),
    requestedRanges: plannedRanges,
  });
  if (!clamped) return { status: "blocked", reason: "no-gap-fits" };

  return {
    status: "ok",
    operations: clamped.map((range) => ({
      type: "createClip",
      clip: {
        ...range.clip,
        id: input.createId(),
        projectId: input.projectId,
        trackId: range.trackId,
        startSampleFrame: range.startSampleFrame,
        durationSampleFrames: range.durationSampleFrames,
      },
    })),
  };
}

export function planPasteClips(input: PasteClipsInput): TimelineEditPlan {
  if (input.clipboardClips.length === 0) return { status: "blocked", reason: "empty-selection" };

  const requestedRanges = input.clipboardClips.map((clip) => ({
    clip: {
      id: "",
      projectId: input.projectId,
      trackId: input.sourceTrackId,
      sampleId: clip.sampleId,
      name: clip.name,
      startSampleFrame: input.playheadSampleFrame + clip.offsetFromFirst,
      durationSampleFrames: clip.durationSampleFrames,
      sourceStartSampleFrame: clip.sourceStartSampleFrame,
      gain: clip.gain,
    },
    trackId: input.sourceTrackId,
    startSampleFrame: input.playheadSampleFrame + clip.offsetFromFirst,
    durationSampleFrames: clip.durationSampleFrames,
  }));

  const clamped = clampGroupToNearestGap({
    clips: input.clips,
    ignoredClipIds: new Set(),
    requestedRanges,
  });
  if (!clamped) return { status: "blocked", reason: "no-gap-fits" };

  return {
    status: "ok",
    operations: clamped.map((range) => ({
      type: "createClip",
      clip: {
        ...range.clip,
        id: input.createId(),
        startSampleFrame: range.startSampleFrame,
      },
    })),
  };
}

export function planTrimClip(input: TrimClipInput): TimelineEditPlan {
  const clip = input.clips.find((item) => item.id === input.clipId);
  if (!clip) return { status: "blocked", reason: "clip-not-found" };
  if (input.sampleDurationSampleFrames === undefined) {
    return { status: "blocked", reason: "missing-sample-duration" };
  }

  const trackClips = input.clips
    .filter((item) => item.trackId === clip.trackId && item.id !== clip.id)
    .sort((a, b) => a.startSampleFrame - b.startSampleFrame);
  const previousClipEnd = Math.max(
    0,
    ...trackClips
      .filter((item) => item.startSampleFrame < clip.startSampleFrame)
      .map((item) => item.startSampleFrame + item.durationSampleFrames),
  );
  const nextClipStart = Math.min(
    input.sampleDurationSampleFrames + clip.startSampleFrame - clip.sourceStartSampleFrame,
    ...trackClips
      .filter((item) => item.startSampleFrame >= clip.startSampleFrame + clip.durationSampleFrames)
      .map((item) => item.startSampleFrame),
  );

  if (input.edge === "left") {
    const originalEnd = clip.startSampleFrame + clip.durationSampleFrames;
    const maxStartByDuration = originalEnd - 1;
    const maxStartBySource =
      clip.startSampleFrame + (input.sampleDurationSampleFrames - clip.sourceStartSampleFrame - 1);
    const startSampleFrame = clamp(
      input.requestedStartSampleFrame,
      Math.max(previousClipEnd, clip.startSampleFrame - clip.sourceStartSampleFrame, 0),
      Math.min(maxStartByDuration, maxStartBySource),
    );
    const deltaSamples = startSampleFrame - clip.startSampleFrame;
    return {
      status: "ok",
      operations: [
        {
          type: "updateClip",
          clipId: clip.id,
          before: clip,
          after: {
            startSampleFrame,
            sourceStartSampleFrame: clip.sourceStartSampleFrame + deltaSamples,
            durationSampleFrames: clip.durationSampleFrames - deltaSamples,
          },
        },
      ],
    };
  }

  const maxDurationBySample = input.sampleDurationSampleFrames - clip.sourceStartSampleFrame;
  const maxDurationByNextClip = nextClipStart - clip.startSampleFrame;
  const durationSampleFrames = clamp(
    input.requestedDurationSampleFrames,
    1,
    Math.max(1, Math.min(maxDurationBySample, maxDurationByNextClip)),
  );

  return {
    status: "ok",
    operations: [
      {
        type: "updateClip",
        clipId: clip.id,
        before: clip,
        after: { durationSampleFrames },
      },
    ],
  };
}

export function planSplitClips(input: SplitClipsInput): TimelineEditPlan {
  const selectedClips = input.clips.filter((clip) => input.selectedClipIds.has(clip.id));
  if (selectedClips.length === 0) return { status: "blocked", reason: "empty-selection" };

  const operations: TimelineEditOperation[] = [];
  for (const clip of selectedClips) {
    const clipEnd = clip.startSampleFrame + clip.durationSampleFrames;
    if (
      input.playheadSampleFrame <= clip.startSampleFrame ||
      input.playheadSampleFrame >= clipEnd
    ) {
      continue;
    }

    const firstDuration = input.playheadSampleFrame - clip.startSampleFrame;
    const secondDuration = clipEnd - input.playheadSampleFrame;
    operations.push({
      type: "updateClip",
      clipId: clip.id,
      before: clip,
      after: { durationSampleFrames: firstDuration },
    });
    operations.push({
      type: "createClip",
      clip: {
        ...clip,
        id: input.createId(),
        projectId: input.projectId,
        startSampleFrame: input.playheadSampleFrame,
        durationSampleFrames: secondDuration,
        sourceStartSampleFrame: clip.sourceStartSampleFrame + firstDuration,
      },
    });
  }

  if (operations.length === 0) return { status: "blocked", reason: "playhead-outside-clip" };
  return { status: "ok", operations };
}

function getEditGroup(
  clips: readonly TimelineEditClip[],
  selectedClipIds: ReadonlySet<string>,
  draggedClipId: string,
): TimelineEditClip[] {
  const draggedClip = clips.find((clip) => clip.id === draggedClipId);
  if (!draggedClip) return [];

  const activeIds = selectedClipIds.has(draggedClipId) ? selectedClipIds : new Set([draggedClipId]);
  return clips.filter((clip) => activeIds.has(clip.id) && clip.trackId === draggedClip.trackId);
}

function planMovedRanges(
  input: Pick<MoveClipsInput, "tracks" | "requestedTrackId" | "requestedStartSampleFrame">,
  group: readonly TimelineEditClip[],
  draggedClip: TimelineEditClip,
): PlannedRange[] | null {
  const originalTrackIndex = input.tracks.findIndex((track) => track.id === draggedClip.trackId);
  const requestedTrackIndex = input.tracks.findIndex(
    (track) => track.id === input.requestedTrackId,
  );
  if (originalTrackIndex === -1 || requestedTrackIndex === -1) return null;

  const groupTrackIndexes = group.map((clip) =>
    input.tracks.findIndex((track) => track.id === clip.trackId),
  );
  if (groupTrackIndexes.some((index) => index === -1)) return null;

  const minTrackIndex = Math.min(...groupTrackIndexes);
  const maxTrackIndex = Math.max(...groupTrackIndexes);
  const requestedTrackOffset = requestedTrackIndex - originalTrackIndex;
  const trackOffset = clamp(
    requestedTrackOffset,
    -minTrackIndex,
    input.tracks.length - 1 - maxTrackIndex,
  );
  const startOffset = input.requestedStartSampleFrame - draggedClip.startSampleFrame;

  return group.map((clip) => {
    const clipTrackIndex = input.tracks.findIndex((track) => track.id === clip.trackId);
    const targetTrack = input.tracks[clipTrackIndex + trackOffset];
    return {
      clip,
      trackId: targetTrack!.id,
      startSampleFrame: Math.max(0, clip.startSampleFrame + startOffset),
      durationSampleFrames: clip.durationSampleFrames,
    };
  });
}

function clampGroupToNearestGap(input: {
  clips: readonly TimelineEditClip[];
  ignoredClipIds: ReadonlySet<string>;
  requestedRanges: readonly PlannedRange[];
}): PlannedRange[] | null {
  const requestedOffset = 0;
  const minOffset = Math.max(
    0,
    -Math.min(...input.requestedRanges.map((range) => range.startSampleFrame)),
  );
  const candidates = new Set<number>([requestedOffset, minOffset]);

  for (const range of input.requestedRanges) {
    for (const obstacle of input.clips) {
      if (input.ignoredClipIds.has(obstacle.id)) continue;
      if (obstacle.trackId !== range.trackId) continue;
      candidates.add(
        obstacle.startSampleFrame - (range.startSampleFrame + range.durationSampleFrames),
      );
      candidates.add(
        obstacle.startSampleFrame + obstacle.durationSampleFrames - range.startSampleFrame,
      );
    }
  }

  let bestOffset: number | null = null;
  for (const candidate of candidates) {
    const offset = Math.max(minOffset, candidate);
    const candidateRanges = input.requestedRanges.map((range) => ({
      ...range,
      startSampleFrame: range.startSampleFrame + offset,
    }));
    if (!rangesAreValid(candidateRanges, input.clips, input.ignoredClipIds)) continue;

    if (
      bestOffset === null ||
      Math.abs(offset - requestedOffset) < Math.abs(bestOffset - requestedOffset) ||
      (Math.abs(offset - requestedOffset) === Math.abs(bestOffset - requestedOffset) &&
        offset > bestOffset)
    ) {
      bestOffset = offset;
    }
  }

  if (bestOffset === null) return null;
  return input.requestedRanges.map((range) => ({
    ...range,
    startSampleFrame: range.startSampleFrame + bestOffset,
  }));
}

function rangesAreValid(
  ranges: readonly PlannedRange[],
  clips: readonly TimelineEditClip[],
  ignoredClipIds: ReadonlySet<string>,
): boolean {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    if (range.startSampleFrame < 0 || range.durationSampleFrames < 1) return false;

    for (let j = i + 1; j < ranges.length; j++) {
      const other = ranges[j]!;
      if (range.trackId === other.trackId && rangesOverlap(range, other)) return false;
    }

    for (const clip of clips) {
      if (ignoredClipIds.has(clip.id)) continue;
      if (clip.trackId !== range.trackId) continue;
      if (rangesOverlap(range, clip)) return false;
    }
  }
  return true;
}

function rangesOverlap(
  a: { startSampleFrame: number; durationSampleFrames: number },
  b: { startSampleFrame: number; durationSampleFrames: number },
): boolean {
  const aEnd = a.startSampleFrame + a.durationSampleFrames;
  const bEnd = b.startSampleFrame + b.durationSampleFrames;
  return a.startSampleFrame < bEnd && b.startSampleFrame < aEnd;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
