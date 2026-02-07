# React Konva Timeline Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the canvas timeline from imperative Canvas API (`canvasRenderer.ts`, 823 lines) to declarative react-konva components, preserving all current interactions (drag, trim, hover, seek, selection, waveforms, playhead animation).

**Architecture:** A Konva `<Stage>` hosts two `<Layer>` elements (static + dynamic), mirroring the current dual-canvas approach. Static layer contains `<TimeRuler>`, `<TrackLane>`, and `<Clip>` (with nested `<Waveform>`, `<TrimHandle>`) components. Dynamic layer contains `<Playhead>` and `<HoverIndicator>`, driven by RAF + refs. Clip interactions use Konva's built-in `draggable` and per-shape events instead of manual hit-testing.

**Tech Stack:** react-konva, konva, React 19, Zustand, Zero sync

**Design doc:** `docs/plans/2026-02-06-react-konva-timeline-design.md`

---

## Task 1: Install react-konva and konva packages

**Files:**

- Modify: `apps/web/package.json`

**Step 1: Install packages**

Run:

```bash
cd apps/web && bun add react-konva konva
```

**Step 2: Verify installation**

Run:

```bash
cd apps/web && bun run check-types
```

Expected: No new type errors.

**Step 3: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "chore: add react-konva and konva packages"
```

---

## Task 2: Create the TimelineStage shell with two Layers

**Files:**

- Create: `apps/web/src/components/project/timeline/TimelineStage.tsx`

This is the outer shell that replaces the dual `<canvas>` elements in `TimelineCanvas.tsx`. It mounts a Konva `<Stage>` with two `<Layer>` elements (static + dynamic) and handles resize via ResizeObserver.

**Step 1: Create the TimelineStage component**

```tsx
// apps/web/src/components/project/timeline/TimelineStage.tsx
import { useEffect, useRef, useState } from "react";
import { Stage, Layer } from "react-konva";
import type Konva from "konva";

interface TimelineStageProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  staticLayerRef: React.RefObject<Konva.Layer | null>;
  dynamicLayerRef: React.RefObject<Konva.Layer | null>;
  children: React.ReactNode;
  dynamicChildren: React.ReactNode;
  /** Wheel handler attached to the container div (not the Stage) */
  onContainerWheel?: (e: WheelEvent) => void;
}

export function TimelineStage({
  containerRef,
  staticLayerRef,
  dynamicLayerRef,
  children,
  dynamicChildren,
  onContainerWheel,
}: TimelineStageProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  // Attach wheel event with passive: false for preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onContainerWheel) return;

    container.addEventListener("wheel", onContainerWheel, { passive: false });
    return () => container.removeEventListener("wheel", onContainerWheel);
  }, [containerRef, onContainerWheel]);

  if (dimensions.width === 0 || dimensions.height === 0) return null;

  return (
    <Stage width={dimensions.width} height={dimensions.height}>
      <Layer ref={staticLayerRef}>{children}</Layer>
      <Layer ref={dynamicLayerRef}>{dynamicChildren}</Layer>
    </Stage>
  );
}
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS (component is not wired in yet, no type errors)

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/TimelineStage.tsx
git commit -m "feat: add TimelineStage shell with dual Konva layers"
```

---

## Task 3: Build TimeRuler component

**Files:**

- Create: `apps/web/src/components/project/timeline/TimeRuler.tsx`

Replaces `drawTimeRuler()` from `canvasRenderer.ts:118-155`. Draws tick marks and time labels using Konva `<Line>` and `<Text>` shapes.

**Step 1: Create the TimeRuler component**

```tsx
// apps/web/src/components/project/timeline/TimeRuler.tsx
import { memo, useMemo } from "react";
import { Group, Line, Rect, Text } from "react-konva";
import { RULER_HEIGHT } from "@/lib/timelineConstants";

interface TimeRulerProps {
  width: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  borderColor: string;
  mutedColor: string;
}

export const TimeRuler = memo(function TimeRuler({
  width,
  scrollLeft,
  pixelsPerSecond,
  borderColor,
  mutedColor,
}: TimeRulerProps) {
  const markers = useMemo(() => {
    const startTime = scrollLeft / pixelsPerSecond;
    const visibleDuration = width / pixelsPerSecond;
    const endTime = startTime + visibleDuration;

    // Calculate marker interval based on zoom level
    const minPixelsBetweenMarkers = 60;
    let markerInterval = 1;
    while (markerInterval * pixelsPerSecond < minPixelsBetweenMarkers) {
      markerInterval *= 2;
    }

    const items: { x: number; label: string }[] = [];
    const firstMarker = Math.floor(startTime / markerInterval) * markerInterval;
    for (let time = firstMarker; time <= endTime; time += markerInterval) {
      const x = (time - startTime) * pixelsPerSecond;
      if (x < 0) continue;
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      items.push({ x, label: `${mins}:${secs.toString().padStart(2, "0")}` });
    }
    return items;
  }, [width, scrollLeft, pixelsPerSecond]);

  return (
    <Group listening={false}>
      {/* Ruler bottom border */}
      <Rect x={0} y={RULER_HEIGHT - 1} width={width} height={1} fill={borderColor} />
      {markers.map((m) => (
        <Group key={m.label + m.x} x={m.x}>
          {/* Tick mark */}
          <Rect y={RULER_HEIGHT - 8} width={1} height={8} fill={mutedColor} />
          {/* Time label */}
          <Text
            text={m.label}
            y={2}
            fontSize={10}
            fontFamily="monospace"
            fill={mutedColor}
            align="center"
            offsetX={0}
          />
        </Group>
      ))}
    </Group>
  );
});
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/TimeRuler.tsx
git commit -m "feat: add TimeRuler Konva component"
```

---

## Task 4: Build TrackLane component

**Files:**

- Create: `apps/web/src/components/project/timeline/TrackLane.tsx`

Replaces `drawTrackLanes()` from `canvasRenderer.ts:160-170`. Draws horizontal separator lines per track.

**Step 1: Create the TrackLane component**

```tsx
// apps/web/src/components/project/timeline/TrackLane.tsx
import { memo } from "react";
import { Rect } from "react-konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";

interface TrackLaneProps {
  trackIndex: number;
  width: number;
  scrollTop: number;
  borderColor: string;
  /** Whether this track is highlighted (target of cross-track drag) */
  isDropTarget?: boolean;
}

export const TrackLane = memo(function TrackLane({
  trackIndex,
  width,
  scrollTop,
  borderColor,
  isDropTarget,
}: TrackLaneProps) {
  const y = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop;

  return (
    <>
      {isDropTarget && (
        <Rect
          x={0}
          y={y}
          width={width}
          height={TRACK_HEIGHT}
          fill="#ffffff"
          opacity={0.08}
          listening={false}
        />
      )}
      <Rect
        x={0}
        y={y + TRACK_HEIGHT - 1}
        width={width}
        height={1}
        fill={borderColor}
        listening={false}
      />
    </>
  );
});
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/TrackLane.tsx
git commit -m "feat: add TrackLane Konva component"
```

---

## Task 5: Build Clip component (body + label + selection glow)

**Files:**

- Create: `apps/web/src/components/project/timeline/Clip.tsx`
- Create: `apps/web/src/components/project/timeline/types.ts`

Replaces the clip rendering section of `drawClips()` from `canvasRenderer.ts:272-468`. The `<Clip>` component renders the rounded rect body, clip name text, selection glow, and pending state pattern. Drag and trim are wired later.

**Step 1: Create shared types**

```tsx
// apps/web/src/components/project/timeline/types.ts
export interface ClipRenderData {
  _id: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  audioStartTime: number; // offset into source audio in samples
  pending?: boolean;
  selected?: boolean;
}

export interface CanvasColors {
  background: string;
  border: string;
  muted: string;
}
```

**Step 2: Create the Clip component**

```tsx
// apps/web/src/components/project/timeline/Clip.tsx
import { memo, useMemo } from "react";
import { Group, Rect, Text } from "react-konva";
import {
  CLIP_BORDER_RADIUS,
  CLIP_PADDING,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  TRIM_HANDLE_WIDTH,
} from "@/lib/timelineConstants";
import { getTrackColor } from "@/lib/canvasRenderer";
import type { ClipRenderData } from "./types";

interface ClipProps {
  clip: ClipRenderData;
  trackIndex: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  /** Override position during drag */
  effectiveStartTime?: number;
  effectiveDuration?: number;
  /** Override track index during cross-track drag */
  effectiveTrackIndex?: number;
  isDragging?: boolean;
  isTrimming?: boolean;
  onClipClick?: (clipId: string, trackId: string, shiftKey: boolean) => void;
  onClipMouseEnter?: (clipId: string) => void;
  onClipMouseLeave?: () => void;
}

export const Clip = memo(function Clip({
  clip,
  trackIndex: baseTrackIndex,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  effectiveStartTime,
  effectiveDuration,
  effectiveTrackIndex,
  isDragging,
  isTrimming,
  onClipClick,
  onClipMouseEnter,
  onClipMouseLeave,
}: ClipProps) {
  const trackIndex = effectiveTrackIndex ?? baseTrackIndex;
  const startTime = effectiveStartTime ?? clip.startTime;
  const duration = effectiveDuration ?? clip.duration;
  const isPending = clip.pending === true;
  const isSelected = clip.selected === true;

  // Calculate clip rectangle
  const startSeconds = startTime / sampleRate;
  const durationSeconds = duration / sampleRate;
  const viewStartTime = scrollLeft / pixelsPerSecond;

  const clipX = (startSeconds - viewStartTime) * pixelsPerSecond;
  const clipWidth = durationSeconds * pixelsPerSecond;
  const clipY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop + CLIP_PADDING;
  const clipHeight = TRACK_HEIGHT - CLIP_PADDING * 2 - 1;

  const trackColor = getTrackColor(trackIndex);

  // Determine opacity
  const bodyOpacity = isPending ? 0.4 : isDragging ? 0.5 : 0.7;
  const borderOpacity = isPending ? 0.6 : isDragging ? 0.7 : 1;

  // Truncate clip name
  const showName = clipWidth > 30;
  const textPadding = 6;

  return (
    <Group
      x={clipX}
      y={clipY}
      onClick={(e) => {
        if (isPending) return;
        onClipClick?.(clip._id, clip.trackId, e.evt.shiftKey);
        e.cancelBubble = true;
      }}
      onMouseEnter={() => onClipMouseEnter?.(clip._id)}
      onMouseLeave={() => onClipMouseLeave?.()}
    >
      {/* Clip background */}
      <Rect
        width={clipWidth}
        height={clipHeight}
        fill={trackColor}
        opacity={bodyOpacity}
        cornerRadius={CLIP_BORDER_RADIUS}
      />

      {/* Clip border */}
      <Rect
        width={clipWidth}
        height={clipHeight}
        stroke={isSelected ? "#ffffff" : trackColor}
        strokeWidth={isSelected ? 2 : isDragging ? 2 : 1}
        opacity={borderOpacity}
        cornerRadius={CLIP_BORDER_RADIUS}
        dash={isPending ? [4, 4] : undefined}
        listening={false}
      />

      {/* Selection glow */}
      {isSelected && !isPending && (
        <Rect
          width={clipWidth}
          height={clipHeight}
          stroke="#ffffff"
          strokeWidth={1}
          opacity={0.5}
          cornerRadius={CLIP_BORDER_RADIUS}
          shadowColor="#ffffff"
          shadowBlur={4}
          listening={false}
        />
      )}

      {/* Clip name */}
      {showName && (
        <Text
          x={textPadding}
          y={0}
          width={clipWidth - textPadding * 2}
          height={clipHeight}
          text={clip.name}
          fontSize={11}
          fontFamily="sans-serif"
          fill="#ffffff"
          opacity={isPending ? 0.5 : isDragging ? 0.6 : 0.9}
          verticalAlign="middle"
          ellipsis={true}
          wrap="none"
          listening={false}
        />
      )}
    </Group>
  );
});
```

**Step 3: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

> **Note:** `getTrackColor` is currently in `canvasRenderer.ts`. In a later task (Task 12) we'll move it to a utility. For now, import from the existing file.

**Step 4: Commit**

```bash
git add apps/web/src/components/project/timeline/types.ts apps/web/src/components/project/timeline/Clip.tsx
git commit -m "feat: add Clip Konva component with body, label, selection glow"
```

---

## Task 6: Add Waveform component with sceneFunc

**Files:**

- Create: `apps/web/src/components/project/timeline/Waveform.tsx`

Replaces `waveformRenderer.ts` (`drawWaveform()` + `shouldDrawWaveform()`). Uses Konva `<Shape>` with a `sceneFunc` callback that uses the same mipmap bucket-drawing logic.

**Step 1: Create the Waveform component**

```tsx
// apps/web/src/components/project/timeline/Waveform.tsx
import { memo } from "react";
import { Shape } from "react-konva";
import type { Context } from "konva/lib/Context";
import type { Shape as ShapeType } from "konva/lib/Shape";
import type { WaveformData } from "@/lib/waveformCache";
import { selectMipmapLevel } from "@/lib/waveformCache";

interface WaveformProps {
  waveform: WaveformData;
  clipWidth: number;
  clipHeight: number;
  audioStartTime: number; // in samples
  clipDuration: number; // in samples
  sampleRate: number;
  pixelsPerSecond: number;
  color: string;
}

export const Waveform = memo(function Waveform({
  waveform,
  clipWidth,
  clipHeight,
  audioStartTime,
  clipDuration,
  sampleRate,
  pixelsPerSecond,
  color,
}: WaveformProps) {
  // Don't render if clip is too narrow
  if (clipWidth <= 10) return null;

  return (
    <Shape
      sceneFunc={(ctx: Context, shape: ShapeType) => {
        const samplesPerPixel = sampleRate / pixelsPerSecond;
        const level = selectMipmapLevel(waveform, samplesPerPixel);

        const startBucket = Math.floor(audioStartTime / level.samplesPerBucket);
        const endSample = audioStartTime + clipDuration;
        const endBucket = Math.ceil(endSample / level.samplesPerBucket);

        const firstBucket = Math.max(0, startBucket);
        const lastBucket = Math.min(level.buckets.length - 1, endBucket);

        if (firstBucket > lastBucket) return;

        const pixelsPerBucket = (level.samplesPerBucket / sampleRate) * pixelsPerSecond;
        const waveformHeight = clipHeight * 0.8;
        const centerY = clipHeight / 2;
        const halfHeight = waveformHeight / 2;

        const _ctx = ctx._context;
        _ctx.fillStyle = color;
        _ctx.globalAlpha = 0.6;

        // Clip to component bounds
        _ctx.save();
        _ctx.beginPath();
        _ctx.rect(0, 0, clipWidth, clipHeight);
        _ctx.clip();

        for (let i = firstBucket; i <= lastBucket; i++) {
          const bucket = level.buckets[i];
          if (!bucket) continue;

          const [min, max] = bucket;
          const bucketStartSample = i * level.samplesPerBucket;
          const sampleOffset = bucketStartSample - audioStartTime;
          const x = (sampleOffset / sampleRate) * pixelsPerSecond;

          if (x + pixelsPerBucket < 0 || x > clipWidth) continue;

          const barWidth = Math.max(1, pixelsPerBucket);
          const barTop = centerY + min * halfHeight;
          const barBottom = centerY + max * halfHeight;
          const barHeight = barBottom - barTop;

          _ctx.fillRect(x, barTop, barWidth, barHeight);
        }

        _ctx.restore();
        ctx.fillStrokeShape(shape);
      }}
      listening={false}
    />
  );
});
```

**Step 2: Wire Waveform into Clip**

Modify `apps/web/src/components/project/timeline/Clip.tsx` to accept waveform data and render `<Waveform>` inside the clip group, after the background rect:

Add props to `ClipProps`:

```tsx
import type { WaveformData } from "@/lib/waveformCache";

// Add to ClipProps interface:
waveformData?: WaveformData;
animationTime?: number;
```

Add inside the `<Group>`, after the clip background `<Rect>`:

```tsx
{/* Waveform */}
{!isPending && waveformData && (
  <Waveform
    waveform={waveformData}
    clipWidth={clipWidth}
    clipHeight={clipHeight}
    audioStartTime={clip.audioStartTime}
    clipDuration={duration}
    sampleRate={sampleRate}
    pixelsPerSecond={pixelsPerSecond}
    color={trackColor}
  />
)}
```

**Step 3: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/project/timeline/Waveform.tsx apps/web/src/components/project/timeline/Clip.tsx
git commit -m "feat: add Waveform Konva component with mipmap sceneFunc"
```

---

## Task 7: Add TrimHandle components

**Files:**

- Create: `apps/web/src/components/project/timeline/TrimHandle.tsx`
- Modify: `apps/web/src/components/project/timeline/Clip.tsx` (add trim handles)

Replaces the trim handle rendering from `canvasRenderer.ts:413-450`. Trim handles are small rects at clip edges that set `ew-resize` cursor on hover. Drag behavior is wired in a later task.

**Step 1: Create the TrimHandle component**

```tsx
// apps/web/src/components/project/timeline/TrimHandle.tsx
import { memo } from "react";
import { Rect } from "react-konva";
import { CLIP_BORDER_RADIUS, TRIM_HANDLE_WIDTH } from "@/lib/timelineConstants";

interface TrimHandleProps {
  edge: "left" | "right";
  clipWidth: number;
  clipHeight: number;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const TrimHandle = memo(function TrimHandle({
  edge,
  clipWidth,
  clipHeight,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: TrimHandleProps) {
  // Don't render if clip is too narrow for handles
  if (clipWidth < TRIM_HANDLE_WIDTH * 2) return null;

  const x = edge === "left" ? 0 : clipWidth - TRIM_HANDLE_WIDTH;
  const cornerRadius =
    edge === "left"
      ? [CLIP_BORDER_RADIUS, 0, 0, CLIP_BORDER_RADIUS]
      : [0, CLIP_BORDER_RADIUS, CLIP_BORDER_RADIUS, 0];

  return (
    <Rect
      x={x}
      y={0}
      width={TRIM_HANDLE_WIDTH}
      height={clipHeight}
      fill="#ffffff"
      opacity={isHovered ? 0.5 : 0.2}
      cornerRadius={cornerRadius}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          const container = stage.container();
          container.style.cursor = "ew-resize";
        }
        onMouseEnter();
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          const container = stage.container();
          container.style.cursor = "crosshair";
        }
        onMouseLeave();
      }}
    />
  );
});
```

**Step 2: Wire TrimHandle into Clip**

Add state and handlers to `Clip.tsx`:

Add to `ClipProps`:

```tsx
// No new props needed — hover is local state within Clip
```

Add local state in `Clip`:

```tsx
const [hoveredEdge, setHoveredEdge] = useState<"left" | "right" | null>(null);
```

Add inside the `<Group>`, after the clip name `<Text>`:

```tsx
{/* Trim handles — only shown when clip is hovered and not pending/dragging */}
{!isPending && !isDragging && (
  <>
    <TrimHandle
      edge="left"
      clipWidth={clipWidth}
      clipHeight={clipHeight}
      isHovered={hoveredEdge === "left"}
      onMouseEnter={() => setHoveredEdge("left")}
      onMouseLeave={() => setHoveredEdge(null)}
    />
    <TrimHandle
      edge="right"
      clipWidth={clipWidth}
      clipHeight={clipHeight}
      isHovered={hoveredEdge === "right"}
      onMouseEnter={() => setHoveredEdge("right")}
      onMouseLeave={() => setHoveredEdge(null)}
    />
  </>
)}
```

Import `useState` and `TrimHandle` at the top of `Clip.tsx`.

**Step 3: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/project/timeline/TrimHandle.tsx apps/web/src/components/project/timeline/Clip.tsx
git commit -m "feat: add TrimHandle Konva component with hover cursor"
```

---

## Task 8: Build DynamicLayer — Playhead and HoverIndicator

**Files:**

- Create: `apps/web/src/components/project/timeline/Playhead.tsx`
- Create: `apps/web/src/components/project/timeline/HoverIndicator.tsx`

Replaces `drawPlayhead()`, `drawHoverIndicator()`, and `drawHoverTooltip()` from `canvasRenderer.ts:474-563`.

**Step 1: Create the Playhead component**

```tsx
// apps/web/src/components/project/timeline/Playhead.tsx
import { memo } from "react";
import { Line } from "react-konva";

interface PlayheadProps {
  /** Playhead X position in canvas pixels (already adjusted for scroll) */
  x: number;
  height: number;
  color: string;
}

export const Playhead = memo(function Playhead({ x, height, color }: PlayheadProps) {
  if (x < 0) return null;

  return (
    <Line
      points={[x, 0, x, height]}
      stroke={color}
      strokeWidth={1}
      listening={false}
    />
  );
});
```

**Step 2: Create the HoverIndicator component**

```tsx
// apps/web/src/components/project/timeline/HoverIndicator.tsx
import { memo } from "react";
import { Group, Line, Rect, Text } from "react-konva";
import { RULER_HEIGHT } from "@/lib/timelineConstants";

interface HoverIndicatorProps {
  /** Hover X position in canvas pixels (null if not hovering) */
  hoverX: number | null;
  /** Hover time in seconds (null if not hovering) */
  hoverTime: number | null;
  stageWidth: number;
  stageHeight: number;
  color: string;
}

function formatTimeForTooltip(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export const HoverIndicator = memo(function HoverIndicator({
  hoverX,
  hoverTime,
  stageWidth,
  stageHeight,
  color,
}: HoverIndicatorProps) {
  if (hoverX === null) return null;

  const showTooltip = hoverTime !== null;
  const tooltipText = showTooltip ? formatTimeForTooltip(hoverTime) : "";
  const tooltipWidth = tooltipText.length * 7 + 12; // approximate
  const tooltipHeight = 18;
  const tooltipY = RULER_HEIGHT + 4;

  // Position tooltip — flip if near right edge
  let tooltipX: number;
  if (hoverX > stageWidth - tooltipWidth - 10) {
    tooltipX = hoverX - tooltipWidth;
  } else {
    tooltipX = hoverX - tooltipWidth / 2;
  }
  tooltipX = Math.max(2, tooltipX);

  return (
    <Group listening={false}>
      {/* Dashed hover line */}
      <Line
        points={[hoverX, 0, hoverX, stageHeight]}
        stroke={color}
        strokeWidth={1}
        opacity={0.4}
        dash={[4, 4]}
      />

      {/* Tooltip background */}
      {showTooltip && (
        <>
          <Rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipWidth}
            height={tooltipHeight}
            fill="#f5f5f5"
            cornerRadius={3}
          />
          <Text
            x={tooltipX + 6}
            y={tooltipY}
            height={tooltipHeight}
            text={tooltipText}
            fontSize={11}
            fontFamily="monospace"
            fill="#171717"
            verticalAlign="middle"
          />
        </>
      )}
    </Group>
  );
});
```

**Step 3: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/project/timeline/Playhead.tsx apps/web/src/components/project/timeline/HoverIndicator.tsx
git commit -m "feat: add Playhead and HoverIndicator Konva components"
```

---

## Task 9: Create useKonvaPlayheadAnimation hook

**Files:**

- Create: `apps/web/src/hooks/useKonvaPlayheadAnimation.ts`

Replaces `usePlayheadAnimation.ts`. Instead of calling `renderDynamicLayer()`, this hook:

1. Subscribes to engine playhead updates via ref
2. Stores hover state in refs
3. Calls `dynamicLayerRef.current.batchDraw()` in a RAF loop

The Playhead and HoverIndicator components read from refs during Konva's draw cycle.

**Step 1: Create the hook**

```tsx
// apps/web/src/hooks/useKonvaPlayheadAnimation.ts
import { useEffect, useRef } from "react";
import type Konva from "konva";
import { useAudioStore } from "@/stores/audioStore";

interface UseKonvaPlayheadAnimationOptions {
  dynamicLayerRef: React.RefObject<Konva.Layer | null>;
  isPlaying: boolean;
  hoverXRef: React.RefObject<number | null>;
  hoverTimeRef: React.RefObject<number | null>;
}

/**
 * RAF-based animation hook for the dynamic Konva layer.
 * Updates playhead position ref and triggers batchDraw on the dynamic layer.
 * Returns playheadTimeRef so Playhead component can read it.
 */
export function useKonvaPlayheadAnimation({
  dynamicLayerRef,
  isPlaying,
  hoverXRef,
  hoverTimeRef,
}: UseKonvaPlayheadAnimationOptions) {
  const playheadTimeRef = useRef(0);
  const isEngineReady = useAudioStore((s) => s.isEngineReady);

  // Subscribe to engine playhead updates directly (bypass Zustand state)
  useEffect(() => {
    if (!isEngineReady) return;

    const unsubscribe = useAudioStore.getState().onPlayheadUpdate((time) => {
      playheadTimeRef.current = time;
    });

    return unsubscribe;
  }, [isEngineReady]);

  // Sync ref with Zustand state for initial value and seek operations
  useEffect(() => {
    const unsubscribe = useAudioStore.subscribe((state) => {
      playheadTimeRef.current = state.playheadTime;
    });
    playheadTimeRef.current = useAudioStore.getState().playheadTime;
    return unsubscribe;
  }, []);

  // RAF loop — triggers batchDraw on the dynamic layer
  useEffect(() => {
    const layer = dynamicLayerRef.current;
    if (!layer) return;

    let animationId: number;
    let lastHoverX: number | null = null;
    let lastPlayheadTime = 0;

    const animate = () => {
      const currentHoverX = hoverXRef.current;
      const currentPlayheadTime = playheadTimeRef.current;

      const hoverChanged = currentHoverX !== lastHoverX;
      const playheadChanged = currentPlayheadTime !== lastPlayheadTime;

      if (isPlaying || hoverChanged || playheadChanged) {
        layer.batchDraw();
        lastHoverX = currentHoverX;
        lastPlayheadTime = currentPlayheadTime;
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initial draw
    layer.batchDraw();
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [dynamicLayerRef, isPlaying, hoverXRef, hoverTimeRef]);

  return { playheadTimeRef };
}
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useKonvaPlayheadAnimation.ts
git commit -m "feat: add useKonvaPlayheadAnimation hook for dynamic layer RAF"
```

---

## Task 10: Wire clip drag (move + cross-track) via Konva events

**Files:**

- Create: `apps/web/src/hooks/useKonvaClipDrag.ts`

Replaces `useClipDrag.ts`. With Konva, the `<Clip>` `<Group>` is `draggable`. Konva handles the visual position during drag. This hook manages:

- `onDragStart`: capture original position
- `onDragMove`: constrain X >= 0, calculate target track from Y
- `onDragEnd`: commit via Zero mutation

**Step 1: Create the hook**

```tsx
// apps/web/src/hooks/useKonvaClipDrag.ts
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type Konva from "konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";

interface ClipDragState {
  clipId: string;
  originalStartTime: number;
  originalTrackId: string;
  currentTrackId: string;
  currentStartTime: number;
}

interface UseKonvaClipDragOptions {
  tracks: { _id: string }[];
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  sampleRate: number;
  updateClipPosition: (args: {
    id: string;
    startTime: number;
    trackId?: string;
  }) => Promise<unknown>;
}

export function useKonvaClipDrag({
  tracks,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  updateClipPosition,
}: UseKonvaClipDragOptions) {
  const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
  const justFinishedDragRef = useRef(false);

  const handleDragStart = useCallback(
    (clipId: string, trackId: string, startTime: number) => {
      justFinishedDragRef.current = false;
      setClipDragState({
        clipId,
        originalStartTime: startTime,
        originalTrackId: trackId,
        currentTrackId: trackId,
        currentStartTime: startTime,
      });
    },
    [],
  );

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, clipId: string) => {
      const node = e.target;
      const x = node.x();
      const y = node.y();

      // Constrain X >= 0
      if (x < 0) node.x(0);

      // Calculate time from position
      const viewStartTime = scrollLeft / pixelsPerSecond;
      const effectiveX = Math.max(0, x);
      const timeSeconds = viewStartTime + effectiveX / pixelsPerSecond;
      const timeInSamples = Math.round(timeSeconds * sampleRate);

      // Calculate target track from Y
      const trackAreaY = y + scrollTop - RULER_HEIGHT;
      const targetTrackIndex = Math.max(
        0,
        Math.min(tracks.length - 1, Math.floor(trackAreaY / TRACK_HEIGHT)),
      );
      const targetTrackId = tracks[targetTrackIndex]?._id;

      if (targetTrackId) {
        setClipDragState((prev) =>
          prev && prev.clipId === clipId
            ? { ...prev, currentTrackId: targetTrackId, currentStartTime: timeInSamples }
            : prev,
        );
      }
    },
    [scrollLeft, scrollTop, pixelsPerSecond, sampleRate, tracks],
  );

  const handleDragEnd = useCallback(
    async (clipId: string) => {
      justFinishedDragRef.current = true;
      // Reset after a tick so click handlers can check it
      setTimeout(() => {
        justFinishedDragRef.current = false;
      }, 50);

      const state = clipDragState;
      if (!state || state.clipId !== clipId) {
        setClipDragState(null);
        return;
      }

      setClipDragState(null);

      try {
        const trackChanged = state.currentTrackId !== state.originalTrackId;
        await updateClipPosition({
          id: clipId,
          startTime: state.currentStartTime,
          trackId: trackChanged ? state.currentTrackId : undefined,
        });
      } catch {
        toast.error("Failed to move clip");
      }
    },
    [clipDragState, updateClipPosition],
  );

  return {
    clipDragState,
    justFinishedDrag: justFinishedDragRef.current,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useKonvaClipDrag.ts
git commit -m "feat: add useKonvaClipDrag hook for Konva-based clip movement"
```

---

## Task 11: Wire clip trim via Konva TrimHandle drag

**Files:**

- Create: `apps/web/src/hooks/useKonvaClipTrim.ts`

Replaces `useClipTrim.ts`. Each `<TrimHandle>` is independently `draggable` with `dragBoundFunc` constraining movement to horizontal only. The hook manages trim state and commits via Zero mutation on drag end.

**Step 1: Create the hook**

```tsx
// apps/web/src/hooks/useKonvaClipTrim.ts
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
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useKonvaClipTrim.ts
git commit -m "feat: add useKonvaClipTrim hook for trim handle drag"
```

---

## Task 12: Extract getTrackColor into timeline utilities

**Files:**

- Create: `apps/web/src/lib/timelineUtils.ts`

Before integrating, extract `getTrackColor()` from `canvasRenderer.ts` into a shared utility so the new Konva components don't depend on the old renderer.

**Step 1: Create the utility file**

```tsx
// apps/web/src/lib/timelineUtils.ts

/**
 * Generate a track color from its index using golden angle for even distribution.
 */
export function getTrackColor(index: number): string {
  const goldenAngle = 137.508;
  const hue = (index * goldenAngle) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Get CSS color values from computed styles with fallbacks.
 */
export function getCanvasColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue("--background").trim() || "#09090b",
    border: styles.getPropertyValue("--border").trim() || "#27272a",
    muted: styles.getPropertyValue("--muted-foreground").trim() || "#71717a",
  };
}
```

**Step 2: Update Clip.tsx import**

Change `import { getTrackColor } from "@/lib/canvasRenderer"` to `import { getTrackColor } from "@/lib/timelineUtils"` in `Clip.tsx`.

**Step 3: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/lib/timelineUtils.ts apps/web/src/components/project/timeline/Clip.tsx
git commit -m "refactor: extract getTrackColor and getCanvasColors into timelineUtils"
```

---

## Task 13: Build the StaticLayer composite component

**Files:**

- Create: `apps/web/src/components/project/timeline/StaticLayer.tsx`

Composes `<TimeRuler>`, `<TrackLane>` × N, and `<Clip>` × N into a single component that the static `<Layer>` renders. Handles viewport culling (only renders visible tracks/clips).

**Step 1: Create the StaticLayer component**

```tsx
// apps/web/src/components/project/timeline/StaticLayer.tsx
import { memo, useMemo } from "react";
import { Group, Rect } from "react-konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { getCanvasColors } from "@/lib/timelineUtils";
import type { WaveformData } from "@/lib/waveformCache";
import { TimeRuler } from "./TimeRuler";
import { TrackLane } from "./TrackLane";
import { Clip } from "./Clip";
import type { ClipRenderData } from "./types";

interface StaticLayerProps {
  width: number;
  height: number;
  tracks: { _id: string }[];
  clips: ClipRenderData[];
  sampleRate: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  selectedClipIds: Set<string>;
  clipDragState: { clipId: string; currentStartTime: number; currentTrackId: string } | null;
  trimState: { clipId: string; currentStartTime: number; currentDuration: number } | null;
  dragOriginalTrackId?: string | null;
  waveformCache: Map<string, WaveformData>;
  onClipClick: (clipId: string, trackId: string, shiftKey: boolean) => void;
  onClipMouseEnter?: (clipId: string) => void;
  onClipMouseLeave?: () => void;
  onBackgroundClick: (x: number) => void;
}

export const StaticLayer = memo(function StaticLayer({
  width,
  height,
  tracks,
  clips,
  sampleRate,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  selectedClipIds,
  clipDragState,
  trimState,
  dragOriginalTrackId,
  waveformCache,
  onClipClick,
  onClipMouseEnter,
  onClipMouseLeave,
  onBackgroundClick,
}: StaticLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  // Build track index map
  const trackIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((track, index) => map.set(track._id, index));
    return map;
  }, [tracks]);

  // Viewport culling for clips
  const startTime = scrollLeft / pixelsPerSecond;
  const visibleDuration = width / pixelsPerSecond;
  const endTime = startTime + visibleDuration;

  return (
    <Group>
      {/* Background — clickable for seek */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={colors.background}
        onClick={(e) => {
          const x = e.evt.offsetX;
          onBackgroundClick(x);
        }}
      />

      {/* Time ruler */}
      <TimeRuler
        width={width}
        scrollLeft={scrollLeft}
        pixelsPerSecond={pixelsPerSecond}
        borderColor={colors.border}
        mutedColor={colors.muted}
      />

      {/* Track lanes */}
      {tracks.map((track, index) => {
        const y = RULER_HEIGHT + index * TRACK_HEIGHT - scrollTop;
        if (y + TRACK_HEIGHT < RULER_HEIGHT || y > height) return null;

        const isDropTarget =
          clipDragState != null &&
          dragOriginalTrackId != null &&
          clipDragState.currentTrackId !== dragOriginalTrackId &&
          clipDragState.currentTrackId === track._id;

        return (
          <TrackLane
            key={track._id}
            trackIndex={index}
            width={width}
            scrollTop={scrollTop}
            borderColor={colors.border}
            isDropTarget={isDropTarget}
          />
        );
      })}

      {/* Clips */}
      {clips.map((clip) => {
        const trackIndex = trackIndexMap.get(clip.trackId);
        if (trackIndex === undefined) return null;

        // Determine effective position
        const isDragging = clipDragState?.clipId === clip._id;
        const isTrimming = trimState?.clipId === clip._id;

        const effectiveStartTime = isDragging
          ? clipDragState.currentStartTime
          : isTrimming
            ? trimState.currentStartTime
            : undefined;
        const effectiveDuration = isTrimming ? trimState.currentDuration : undefined;
        const effectiveTrackIndex = isDragging
          ? trackIndexMap.get(clipDragState.currentTrackId)
          : undefined;

        // Viewport cull
        const st = (effectiveStartTime ?? clip.startTime) / sampleRate;
        const dur = (effectiveDuration ?? clip.duration) / sampleRate;
        if (st + dur < startTime || st > endTime) return null;

        return (
          <Clip
            key={clip._id}
            clip={{ ...clip, selected: selectedClipIds.has(clip._id) }}
            trackIndex={trackIndex}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            pixelsPerSecond={pixelsPerSecond}
            sampleRate={sampleRate}
            effectiveStartTime={effectiveStartTime}
            effectiveDuration={effectiveDuration}
            effectiveTrackIndex={effectiveTrackIndex}
            isDragging={isDragging}
            isTrimming={isTrimming}
            waveformData={waveformCache.get(clip.audioFileId)}
            onClipClick={onClipClick}
            onClipMouseEnter={onClipMouseEnter}
            onClipMouseLeave={onClipMouseLeave}
          />
        );
      })}
    </Group>
  );
});
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/StaticLayer.tsx
git commit -m "feat: add StaticLayer composite Konva component"
```

---

## Task 14: Build the DynamicLayer composite component

**Files:**

- Create: `apps/web/src/components/project/timeline/DynamicLayer.tsx`

Composes `<Playhead>` and `<HoverIndicator>` in the dynamic layer. These components read from refs that are updated by the RAF loop.

**Step 1: Create the DynamicLayer component**

```tsx
// apps/web/src/components/project/timeline/DynamicLayer.tsx
import { memo, useMemo } from "react";
import { Group } from "react-konva";
import { getCanvasColors } from "@/lib/timelineUtils";
import { Playhead } from "./Playhead";
import { HoverIndicator } from "./HoverIndicator";

interface DynamicLayerProps {
  width: number;
  height: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  playheadTimeRef: React.RefObject<number>;
  hoverXRef: React.RefObject<number | null>;
  hoverTimeRef: React.RefObject<number | null>;
}

export const DynamicLayer = memo(function DynamicLayer({
  width,
  height,
  scrollLeft,
  pixelsPerSecond,
  playheadTimeRef,
  hoverXRef,
  hoverTimeRef,
}: DynamicLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  // Calculate playhead X from time ref
  const viewStartTime = scrollLeft / pixelsPerSecond;
  const playheadX = (playheadTimeRef.current - viewStartTime) * pixelsPerSecond;

  return (
    <Group>
      <Playhead x={playheadX} height={height} color={colors.muted} />
      <HoverIndicator
        hoverX={hoverXRef.current}
        hoverTime={hoverTimeRef.current}
        stageWidth={width}
        stageHeight={height}
        color={colors.muted}
      />
    </Group>
  );
});
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/DynamicLayer.tsx
git commit -m "feat: add DynamicLayer composite Konva component"
```

---

## Task 15: Create the new TimelineCanvas that integrates everything

**Files:**

- Create: `apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx`

This is the new version of `TimelineCanvas.tsx` that uses Konva instead of raw canvas. It:

- Uses `TimelineStage` with `StaticLayer` and `DynamicLayer`
- Wires `useTimelineZoom` (mostly unchanged)
- Wires `useKonvaClipDrag` and `useKonvaClipTrim`
- Wires `useKonvaPlayheadAnimation`
- Wires `useTimelineFileDrop` (unchanged)
- Handles hover state via Konva events (replacing `useTimelineCanvasEvents`)
- Manages waveform loading (same as current)
- Renders HTML overlays (drop zone, upload spinner, zoom controls — same as current)

**Step 1: Create the new component**

This file will be ~300 lines. Key sections:

```tsx
// apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx
import { Loader2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZero } from "@rocicorp/zero/react";
import type Konva from "konva";

import type { ClipData } from "@/hooks/useClipDrag";
import { useKonvaClipDrag } from "@/hooks/useKonvaClipDrag";
import { useKonvaClipTrim } from "@/hooks/useKonvaClipTrim";
import { useKonvaPlayheadAnimation } from "@/hooks/useKonvaPlayheadAnimation";
import { useTimelineFileDrop } from "@/hooks/useTimelineFileDrop";
import { useTimelineZoom } from "@/hooks/useTimelineZoom";
import { useAudioStore } from "@/stores/audioStore";
import { fetchWaveform, clearWaveformCache, type WaveformData } from "@/lib/waveformCache";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mutators } from "@el-audio-daw/zero/mutators";

import { TimelineStage } from "./TimelineStage";
import { StaticLayer } from "./StaticLayer";
import { DynamicLayer } from "./DynamicLayer";

export interface TimelineCanvasKonvaProps {
  tracks: { _id: string; name: string }[];
  clips: ClipData[];
  sampleRate: number;
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onSeek: (time: number) => void | Promise<void>;
  projectId: string;
  selectedClipIds: Set<string>;
  onSelectClip: (clipId: string, trackId: string) => void;
  onToggleClipSelection: (clipId: string, trackId: string) => void;
  onClearSelection: () => void;
  getAudioFileDuration: (audioFileId: string) => number | undefined;
  waveformUrls: Record<string, string | null>;
}

export function TimelineCanvasKonva({
  tracks,
  clips,
  sampleRate,
  scrollTop,
  onScrollChange,
  onSeek,
  projectId,
  selectedClipIds,
  onSelectClip,
  onToggleClipSelection,
  onClearSelection,
  getAudioFileDuration,
  waveformUrls,
}: TimelineCanvasKonvaProps) {
  const z = useZero();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // kept for useTimelineZoom compat
  const staticLayerRef = useRef<Konva.Layer>(null);
  const dynamicLayerRef = useRef<Konva.Layer>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const isPlaying = useAudioStore((s) => s.isPlaying);

  // Waveform cache
  const [loadedWaveforms, setLoadedWaveforms] = useState<Map<string, WaveformData>>(new Map());

  // Hover state refs (perf: no React re-renders on mouse move)
  const hoverXRef = useRef<number | null>(null);
  const hoverTimeRef = useRef<number | null>(null);

  const totalTrackHeight = tracks.length * TRACK_HEIGHT;
  const viewportHeight = dimensions.height - RULER_HEIGHT;
  const maxScrollTop = Math.max(0, totalTrackHeight - viewportHeight);

  // Zoom
  const {
    scrollLeft,
    pixelsPerSecond,
    setScrollLeft,
    canZoomIn,
    canZoomOut,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoom,
  } = useTimelineZoom({ containerRef, canvasRef, hoverX: null, dimensions });

  // Zero mutations
  const updateClipPosition = useCallback(
    async (args: { id: string; startTime: number; trackId?: string }) => {
      if (args.trackId) {
        await z.mutate(mutators.clips.move({ id: args.id, trackId: args.trackId, startTime: args.startTime }));
      } else {
        await z.mutate(mutators.clips.update({ id: args.id, startTime: args.startTime }));
      }
    },
    [z],
  );

  const trimClip = useCallback(
    async (args: { id: string; startTime: number; audioStartTime: number; duration: number }) => {
      await z.mutate(mutators.clips.update(args)).client;
    },
    [z],
  );

  // Clip drag
  const { clipDragState, handleDragStart, handleDragMove, handleDragEnd } = useKonvaClipDrag({
    tracks,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    sampleRate,
    updateClipPosition,
  });

  // Clip trim
  const { trimState, handleTrimStart, handleTrimMove, handleTrimEnd } = useKonvaClipTrim({
    pixelsPerSecond,
    sampleRate,
    trimClip,
    getAudioFileDuration,
  });

  // Playhead animation
  const { playheadTimeRef } = useKonvaPlayheadAnimation({
    dynamicLayerRef,
    isPlaying,
    hoverXRef,
    hoverTimeRef,
  });

  // File drop (unchanged)
  const { isDraggingFile, dropTarget, isUploading, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useTimelineFileDrop({
      canvasRef,
      containerRef,
      tracks: tracks.map((t) => ({ ...t, order: 0, muted: false, solo: false, gain: 1 })),
      scrollLeft,
      scrollTop,
      pixelsPerSecond,
      sampleRate,
      projectId,
      rulerHeight: RULER_HEIGHT,
      trackHeight: TRACK_HEIGHT,
    });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Waveform fetching
  useEffect(() => {
    const fetchAll = async () => {
      for (const [audioFileId, storageKey] of Object.entries(waveformUrls)) {
        if (loadedWaveforms.has(audioFileId) || !storageKey) continue;
        const waveform = await fetchWaveform(audioFileId, storageKey, projectId);
        if (waveform) setLoadedWaveforms((prev) => new Map(prev).set(audioFileId, waveform));
      }
    };
    fetchAll();
  }, [waveformUrls, loadedWaveforms, projectId]);

  useEffect(() => {
    return () => clearWaveformCache();
  }, []);

  // Wheel handler (zoom + scroll)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const stage = staticLayerRef.current?.getStage();
      const stageContainer = stage?.container();
      if (stageContainer) {
        const rect = stageContainer.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const wheelEvent = { deltaY: e.deltaY, ctrlKey: e.ctrlKey, metaKey: e.metaKey } as React.WheelEvent;
        if (handleWheelZoom(wheelEvent, cursorX)) return;
      }

      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setScrollLeft((prev) => Math.max(0, prev + delta));
      } else {
        const newScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + e.deltaY));
        onScrollChange(newScrollTop);
      }
    },
    [handleWheelZoom, setScrollLeft, maxScrollTop, scrollTop, onScrollChange],
  );

  // Clip click handler
  const handleClipClick = useCallback(
    (clipId: string, trackId: string, shiftKey: boolean) => {
      if (shiftKey) {
        onToggleClipSelection(clipId, trackId);
      } else {
        onSelectClip(clipId, trackId);
      }
    },
    [onSelectClip, onToggleClipSelection],
  );

  // Background click handler (seek + clear selection)
  const handleBackgroundClick = useCallback(
    (x: number) => {
      onClearSelection();
      const time = (x + scrollLeft) / pixelsPerSecond;
      onSeek(Math.max(0, time));
    },
    [scrollLeft, pixelsPerSecond, onSeek, onClearSelection],
  );

  // Mouse move on stage container for hover state
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const scrolledX = canvasX + scrollLeft;
      const time = scrolledX / pixelsPerSecond;
      hoverXRef.current = canvasX;
      hoverTimeRef.current = Math.max(0, time);
    },
    [scrollLeft, pixelsPerSecond],
  );

  const handleMouseLeave = useCallback(() => {
    hoverXRef.current = null;
    hoverTimeRef.current = null;
  }, []);

  // Drop indicator
  const dropIndicatorStyle = dropTarget
    ? {
        left: (dropTarget.dropTimeInSamples / sampleRate - scrollLeft / pixelsPerSecond) * pixelsPerSecond,
        top: RULER_HEIGHT + dropTarget.trackIndex * TRACK_HEIGHT - scrollTop,
        height: TRACK_HEIGHT,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <TimelineStage
        containerRef={containerRef}
        staticLayerRef={staticLayerRef}
        dynamicLayerRef={dynamicLayerRef}
        onContainerWheel={handleWheel}
        children={
          <StaticLayer
            width={dimensions.width}
            height={dimensions.height}
            tracks={tracks}
            clips={clips}
            sampleRate={sampleRate}
            scrollLeft={scrollLeft}
            scrollTop={scrollTop}
            pixelsPerSecond={pixelsPerSecond}
            selectedClipIds={selectedClipIds}
            clipDragState={clipDragState}
            trimState={trimState}
            dragOriginalTrackId={clipDragState?.originalTrackId}
            waveformCache={loadedWaveforms}
            onClipClick={handleClipClick}
            onBackgroundClick={handleBackgroundClick}
          />
        }
        dynamicChildren={
          <DynamicLayer
            width={dimensions.width}
            height={dimensions.height}
            scrollLeft={scrollLeft}
            pixelsPerSecond={pixelsPerSecond}
            playheadTimeRef={playheadTimeRef}
            hoverXRef={hoverXRef}
            hoverTimeRef={hoverTimeRef}
          />
        }
      />

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-primary/10 ring-2 ring-inset ring-primary/50">
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-background/90 px-6 py-4 shadow-lg">
              <Upload className="size-8 text-primary" />
              <span className="text-sm font-medium">Drop audio file on a track</span>
            </div>
          </div>
        </div>
      )}

      {/* Drop target indicator */}
      {dropTarget && dropIndicatorStyle && (
        <div
          className="pointer-events-none absolute z-30 w-0.5 bg-primary"
          style={{ left: dropIndicatorStyle.left, top: dropIndicatorStyle.top, height: dropIndicatorStyle.height }}
        />
      )}

      {/* Upload loading overlay */}
      {isUploading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 shadow-lg">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Uploading audio...</span>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-0 top-0 z-10 flex h-6 items-center gap-0.5 border-b bg-background">
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" onClick={handleZoomOut} disabled={!canZoomOut}>
                <ZoomOut className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
        <Tooltip delay={500}>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" onClick={handleZoomIn} disabled={!canZoomIn}>
                <ZoomIn className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS (not wired in yet — just type checking)

**Step 3: Commit**

```bash
git add apps/web/src/components/project/timeline/TimelineCanvasKonva.tsx
git commit -m "feat: add TimelineCanvasKonva integrating all Konva components"
```

---

## Task 16: Swap TimelinePanel to use new Konva canvas

**Files:**

- Modify: `apps/web/src/components/project/TimelinePanel.tsx`

Replace the import of `TimelineCanvas` with `TimelineCanvasKonva`. The props interface is identical.

**Step 1: Update the import**

In `apps/web/src/components/project/TimelinePanel.tsx`:

Change:

```tsx
import { TimelineCanvas } from "./TimelineCanvas";
```

To:

```tsx
import { TimelineCanvasKonva as TimelineCanvas } from "./timeline/TimelineCanvasKonva";
```

**Step 2: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 3: Manual verification**

Run the dev server:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run --filter web dev
```

Open the app in browser. Check:

- [ ] Timeline renders with tracks and ruler
- [ ] Clips appear with correct colors and names
- [ ] Waveforms render inside clips
- [ ] Playhead line visible
- [ ] Hover line appears on mouse move
- [ ] Zoom in/out works (buttons + ctrl/cmd + scroll)
- [ ] Horizontal scroll works (shift + scroll or trackpad)
- [ ] Vertical scroll works (scroll wheel)
- [ ] Click on empty area seeks playhead
- [ ] Click on clip selects it (glow border appears)
- [ ] Shift-click selects multiple clips
- [ ] File drag-drop still works

**Step 4: Commit**

```bash
git add apps/web/src/components/project/TimelinePanel.tsx
git commit -m "feat: swap TimelinePanel to use Konva-based canvas"
```

---

## Task 17: Fix issues and iterate

After manual testing, there will likely be issues. This task is a buffer for fixing:

- Coordinate misalignments between Konva positions and the old canvas math
- Konva `<Text>` centering (uses different alignment than Canvas API)
- Cursor style management (Konva stages manage their own cursor)
- DPI handling (Konva handles DPI automatically — verify no double-scaling)
- Performance issues with many clips (add `React.memo` where needed, use `listening={false}` on non-interactive shapes)
- RAF loop not triggering dynamic layer redraw

For each fix:

**Step N: Fix the issue**

Edit the relevant file.

**Step N+1: Verify the fix**

Refresh browser and confirm the issue is resolved.

**Step N+2: Commit**

```bash
git add -A && git commit -m "fix: [description of fix]"
```

---

## Task 18: Delete old imperative files

**Files:**

- Delete: `apps/web/src/lib/canvasRenderer.ts`
- Delete: `apps/web/src/lib/waveformRenderer.ts`
- Delete: `apps/web/src/hooks/useClipMouseHandlers.ts`
- Delete: `apps/web/src/hooks/useTimelineCanvasEvents.ts`
- Delete: `apps/web/src/hooks/usePlayheadAnimation.ts`
- Delete: `apps/web/src/hooks/useClipDrag.ts`
- Delete: `apps/web/src/hooks/useClipTrim.ts`
- Delete: `apps/web/src/components/project/TimelineCanvas.tsx`

**Step 1: Verify no other imports reference old files**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw
grep -r "canvasRenderer" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v node_modules
grep -r "waveformRenderer" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v node_modules
grep -r "useClipMouseHandlers" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v node_modules
grep -r "useTimelineCanvasEvents" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v node_modules
grep -r "usePlayheadAnimation" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v node_modules
grep -r "from.*useClipDrag" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v useKonva | grep -v node_modules
grep -r "from.*useClipTrim" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v timeline/ | grep -v useKonva | grep -v node_modules
```

Expected: No results, or only references from old `TimelineCanvas.tsx` (which is also being deleted).

> **Important:** The `ClipData` type is currently exported from `useClipDrag.ts`. Before deleting, move this type to `apps/web/src/components/project/timeline/types.ts` and update all imports.

**Step 2: Move ClipData type**

Add to `apps/web/src/components/project/timeline/types.ts` (if not already there from Task 5):

```tsx
export interface ClipData {
  _id: string;
  trackId: string;
  audioFileId: string;
  name: string;
  startTime: number;
  duration: number;
  audioStartTime: number;
  pending?: boolean;
}
```

Update `TimelineCanvasKonva.tsx` import from `@/hooks/useClipDrag` → `./types`.
Update `TimelinePanel.tsx` import if needed.

**Step 3: Delete old files**

```bash
rm apps/web/src/lib/canvasRenderer.ts
rm apps/web/src/lib/waveformRenderer.ts
rm apps/web/src/hooks/useClipMouseHandlers.ts
rm apps/web/src/hooks/useTimelineCanvasEvents.ts
rm apps/web/src/hooks/usePlayheadAnimation.ts
rm apps/web/src/hooks/useClipDrag.ts
rm apps/web/src/hooks/useClipTrim.ts
rm apps/web/src/components/project/TimelineCanvas.tsx
```

**Step 4: Verify it builds**

Run:

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run check-types
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete old imperative canvas rendering files"
```

---

## Task 19: Update canvasRenderer references in timelineUtils

**Files:**

- Modify: `apps/web/src/lib/canvasRenderer.ts` → already deleted
- Verify: No remaining imports from deleted files

**Step 1: Run linter**

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun check
```

**Step 2: Fix any lint errors**

**Step 3: Run type check**

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun check-types
```

Expected: PASS

**Step 4: Commit if changes were needed**

```bash
git add -A && git commit -m "chore: fix lint errors after cleanup"
```

---

## Task 20: End-to-end manual verification

No test framework exists in this project. Run through the full interaction matrix manually.

**Step 1: Start dev server**

```bash
cd /Users/casperleerink/Desktop/code/el-audio-daw && bun run --filter web dev
```

**Step 2: Verify all interactions**

| Feature          | How to test                | Expected behavior                                 |
| ---------------- | -------------------------- | ------------------------------------------------- |
| Track rendering  | Open a project with tracks | Horizontal lane separators visible                |
| Time ruler       | Look at top bar            | Time labels (0:00, 0:01, etc.) with ticks         |
| Clip rendering   | Have clips on tracks       | Colored rounded rects with names                  |
| Waveforms        | Clips with audio files     | Waveform bars visible inside clips                |
| Clip selection   | Click a clip               | White glow border appears                         |
| Multi-select     | Shift+click clips          | Multiple clips selected                           |
| Deselect         | Click empty area           | All clips deselected                              |
| Seek             | Click empty area           | Playhead moves to click position                  |
| Playback         | Press play                 | Playhead animates smoothly                        |
| Zoom in          | Ctrl/Cmd + scroll up       | Timeline zooms in                                 |
| Zoom out         | Ctrl/Cmd + scroll down     | Timeline zooms out                                |
| Zoom buttons     | Click +/- buttons          | Zoom changes                                      |
| H-scroll         | Shift + scroll             | Timeline pans horizontally                        |
| V-scroll         | Scroll                     | Timeline pans vertically (synced with track list) |
| Clip drag        | Drag a clip body           | Clip moves along timeline                         |
| Cross-track drag | Drag clip vertically       | Clip moves to different track                     |
| Left trim        | Drag left edge of clip     | Start time adjusts, duration shrinks              |
| Right trim       | Drag right edge of clip    | Duration changes                                  |
| Trim cursor      | Hover clip edges           | Cursor becomes ew-resize                          |
| File drop        | Drag audio file onto track | File uploads, clip appears                        |
| Hover indicator  | Move mouse over timeline   | Dashed line follows cursor                        |
| Hover tooltip    | Move mouse over timeline   | Time tooltip appears                              |
| Pending clips    | Drop a new file            | Striped clip appears during upload                |

**Step 3: Note any issues for Task 17-style fixes**

---

## Summary

| Task | Description               | New Files                                              | Deleted Files |
| ---- | ------------------------- | ------------------------------------------------------ | ------------- |
| 1    | Install packages          | —                                                      | —             |
| 2    | TimelineStage shell       | `timeline/TimelineStage.tsx`                           | —             |
| 3    | TimeRuler                 | `timeline/TimeRuler.tsx`                               | —             |
| 4    | TrackLane                 | `timeline/TrackLane.tsx`                               | —             |
| 5    | Clip (body + label)       | `timeline/Clip.tsx`, `timeline/types.ts`               | —             |
| 6    | Waveform                  | `timeline/Waveform.tsx`                                | —             |
| 7    | TrimHandle                | `timeline/TrimHandle.tsx`                              | —             |
| 8    | Playhead + HoverIndicator | `timeline/Playhead.tsx`, `timeline/HoverIndicator.tsx` | —             |
| 9    | Playhead animation hook   | `useKonvaPlayheadAnimation.ts`                         | —             |
| 10   | Clip drag hook            | `useKonvaClipDrag.ts`                                  | —             |
| 11   | Clip trim hook            | `useKonvaClipTrim.ts`                                  | —             |
| 12   | Extract utils             | `timelineUtils.ts`                                     | —             |
| 13   | StaticLayer composite     | `timeline/StaticLayer.tsx`                             | —             |
| 14   | DynamicLayer composite    | `timeline/DynamicLayer.tsx`                            | —             |
| 15   | TimelineCanvasKonva       | `timeline/TimelineCanvasKonva.tsx`                     | —             |
| 16   | Swap in TimelinePanel     | —                                                      | —             |
| 17   | Fix issues                | —                                                      | —             |
| 18   | Delete old files          | —                                                      | 8 files       |
| 19   | Lint + type check cleanup | —                                                      | —             |
| 20   | End-to-end verification   | —                                                      | —             |
