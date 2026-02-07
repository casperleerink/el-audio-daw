# React Konva Timeline Migration Design

**Date:** 2026-02-06
**Status:** Draft
**Goal:** Migrate the canvas timeline from imperative Canvas API to declarative react-konva components for improved developer experience.

## Motivation

The current timeline uses a raw HTML Canvas API with 823 lines of imperative drawing code in `canvasRenderer.ts`. While performant, the imperative style (manual `ctx.save()/restore()`, text truncation, clipping, hit-testing) is hard to read and maintain. Migrating to react-konva gives us:

- **Declarative JSX** — clips, waveforms, playhead become React components
- **Built-in hit detection** — no more manual `findClipAtPosition()` and hover zone math
- **Per-shape events** — `onDragMove`, `onMouseEnter` directly on shapes
- **Konva layer system** — preserves our dual-canvas performance model natively

## Architecture

### Component Tree

```
TimelinePanel (unchanged — data provider)
└── TimelineCanvas (refactored — hosts Konva Stage)
    ├── <Stage>
    │   ├── <Layer ref={staticLayerRef}>       (clips, waveforms, ruler, track lanes)
    │   │   ├── <TimeRuler />                  tick marks + time labels
    │   │   ├── <TrackLane /> × N              per-track background stripe
    │   │   └── <Clip /> × N                   per-clip container
    │   │       ├── <Group clip={...}>          clip bounds clipping
    │   │       │   ├── <Rect />               rounded background + selection glow
    │   │       │   ├── <Waveform />           Custom Shape (sceneFunc)
    │   │       │   ├── <Text />               clip name label
    │   │       │   └── <TrimHandle /> × 2     left/right edge rects
    │   │
    │   └── <Layer ref={dynamicLayerRef}>      (playhead, hover — separate canvas)
    │       ├── <Playhead />                   vertical line at current time
    │       ├── <HoverLine />                  vertical line at cursor
    │       └── <HoverTooltip />               time label near cursor
    │
    ├── Drop overlays (HTML, unchanged)
    └── Zoom controls (HTML, unchanged)
```

### Layer Strategy

Konva `<Layer>` maps to a separate `<canvas>` element — identical to the current dual-canvas approach:

- **Static Layer:** Redraws only when clip data, scroll, or zoom changes. Contains all clips, waveforms, ruler, track backgrounds.
- **Dynamic Layer:** Redraws on every animation frame during playback or hover. Contains playhead line, hover indicator, hover tooltip. Updated via `dynamicLayerRef.current.batchDraw()` in a RAF loop.

## Interaction Model

### Clip Drag (Move)

The `<Clip>` `<Group>` is `draggable`. Konva handles visual position during drag.

- `onDragStart`: capture original position, set drag state
- `onDragMove`: constrain X >= 0, calculate target track from Y snap
- `onDragEnd`: commit position via Zero mutation, revert on error

Cross-track movement: snap Y to nearest track lane boundary during `onDragMove`.

### Clip Trim

`<TrimHandle>` rects at clip edges are independently `draggable`, constrained to horizontal via `dragBoundFunc`.

- Left trim: adjusts `startTime` + `audioStartTime` + `duration` (3 values)
- Right trim: adjusts `duration` only
- Constraints: audio bounds, minimum duration (same as current)
- `onDragEnd`: commit via Zero mutation

### Hover & Cursor

- `<Clip>` components use `onMouseEnter`/`onMouseLeave` to track `hoveredClipId`
- `<TrimHandle>` nodes set cursor to `ew-resize` on hover
- No manual `findClipAtPosition()` needed — Konva does shape hit-testing

### Playhead Seek

Click on the static layer background triggers seek. Konva events bubble — check `e.target` to distinguish background clicks from clip clicks.

### Selection

- Click on clip: select (with shift-click multi-select)
- Click on background: clear selection + seek
- Same logic as current, but driven by Konva events on individual shapes

### Zoom & Scroll

`useTimelineZoom` hook is mostly unchanged. Wheel events on the Stage container div:

- Ctrl/Cmd + scroll → zoom (adjust `pixelsPerSecond`)
- Shift/horizontal → horizontal scroll (`scrollLeft`)
- Vertical → vertical scroll (synced with track list)

Position recalculation: when zoom/scroll changes, clip X/width are recalculated from time values. This drives React re-renders of `<Clip>` components.

### Playhead Animation

`usePlayheadAnimation` RAF loop continues, but instead of calling `renderDynamicLayer()`:

1. Read playhead time from engine ref
2. Update a position ref
3. Call `dynamicLayerRef.current.batchDraw()`

The `<Playhead>` component reads position from the ref in its render. Only the dynamic layer redraws.

## Waveform Rendering

Waveforms use Konva `<Shape>` with a `sceneFunc` callback:

```tsx
<Shape
  sceneFunc={(ctx, shape) => {
    // Same mipmap bar-drawing logic as current waveformRenderer.ts
    // ctx is a Konva.Context wrapping CanvasRenderingContext2D
    for (const bucket of visibleBuckets) {
      ctx.fillRect(x, minY, barWidth, barHeight);
    }
    ctx.fillStrokeShape(shape);
  }}
  fill={trackColor}
  opacity={0.6}
  listening={false}  // not interactive, skip hit detection
/>
```

- Mipmap level selection based on zoom (unchanged logic)
- Viewport culling handled by only rendering visible buckets
- `listening={false}` skips hit-testing for performance
- Waveform data still fetched/cached by `waveformCache.ts`

## File Changes

### New Files (`apps/web/src/components/project/timeline/`)

| File                 | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `TimelineStage.tsx`  | Stage + two Layers, scroll/zoom offset, resize handling              |
| `StaticLayer.tsx`    | Ruler, track lanes, clips — receives data props                      |
| `DynamicLayer.tsx`   | Playhead, hover line, tooltip — driven by refs + RAF                 |
| `TimeRuler.tsx`      | Tick marks + time labels using Konva `<Line>` + `<Text>`             |
| `TrackLane.tsx`      | Background rect per track                                            |
| `Clip.tsx`           | Group with body, waveform, label, trim handles. Handles drag events. |
| `Waveform.tsx`       | `<Shape>` with sceneFunc for mipmap bar rendering                    |
| `Playhead.tsx`       | Animated vertical `<Line>`                                           |
| `HoverIndicator.tsx` | Hover line + tooltip `<Text>`                                        |

### Refactored Hooks

| Hook                      | Change                                                          |
| ------------------------- | --------------------------------------------------------------- |
| `useClipDrag.ts`          | Simplified — Konva drag events replace manual position tracking |
| `useClipTrim.ts`          | Simplified — trim handles are draggable Konva nodes             |
| `usePlayheadAnimation.ts` | Simplified — updates ref + calls `layer.batchDraw()`            |
| `useTimelineZoom.ts`      | Mostly unchanged — drives position calculations                 |
| `useTimelineFileDrop.ts`  | Unchanged — HTML drag-drop, not canvas                          |

### Deleted Files

| File                         | Reason                                     |
| ---------------------------- | ------------------------------------------ |
| `canvasRenderer.ts`          | Replaced by Konva components               |
| `waveformRenderer.ts`        | Logic moved into `Waveform.tsx` sceneFunc  |
| `useClipMouseHandlers.ts`    | Konva per-shape events replace coordinator |
| `useTimelineCanvasEvents.ts` | Events go on individual Konva shapes       |

### Unchanged Files

| File                      | Reason                                    |
| ------------------------- | ----------------------------------------- |
| `timelineConstants.ts`    | Still used for dimensions, styling values |
| `timelineCalculations.ts` | Still used for coordinate conversions     |
| `waveformCache.ts`        | Still fetches/caches waveform binary data |
| `TimelinePanel.tsx`       | Still the data provider wrapper           |
| `useSyncRef.ts`           | Still useful for ref synchronization      |
| All stores                | No changes to audio/editor Zustand stores |

## Implementation Order

1. Install `react-konva` and `konva` packages
2. Create `TimelineStage` with Stage, two Layers, resize observer
3. Build static layer components: `TimeRuler`, `TrackLane`
4. Build `Clip` component with body rect, label, selection glow
5. Add `Waveform` component with sceneFunc
6. Add `TrimHandle` components with horizontal drag
7. Wire up clip drag (move + cross-track)
8. Build `DynamicLayer`: `Playhead`, `HoverIndicator`
9. Wire playhead animation RAF loop to dynamic layer
10. Wire zoom/scroll to Stage positioning
11. Integrate with `TimelinePanel` (replace old `TimelineCanvas`)
12. Delete old imperative files
13. Test all interactions end-to-end

## Risks & Mitigations

| Risk                                    | Mitigation                                               |
| --------------------------------------- | -------------------------------------------------------- |
| Konva re-render perf with many clips    | Use `React.memo`, Konva node caching, viewport culling   |
| Waveform rendering perf                 | `listening={false}` on waveforms, same mipmap strategy   |
| Bundle size increase (~150KB for konva) | Acceptable trade-off for DX improvement                  |
| Konva drag conflicts with scroll        | Attach wheel to container div, not Stage                 |
| Learning curve                          | Konva API is well-documented, maps closely to Canvas API |
