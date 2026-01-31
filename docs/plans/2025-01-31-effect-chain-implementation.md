# Effect Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-track effect chain system with a collapsible bottom panel UI and an SVF filter effect.

**Architecture:** Effects are stored in a new `trackEffects` Convex table with discriminated union types for type-safe effect parameters. The audio engine renders effects pre-fader in the DSP graph. The frontend adds a collapsible bottom panel that shows effects for the selected track.

**Tech Stack:** Convex (backend), Elementary Audio (DSP), React 19, TailwindCSS v4, Base UI

---

## Task 1: Add trackEffects Table to Convex Schema

**Files:**
- Modify: `packages/backend/convex/schema.ts`

**Step 1: Add the trackEffects table definition**

Add after the `clips` table definition in schema.ts:

```typescript
  trackEffects: defineTable({
    trackId: v.id("tracks"),
    order: v.number(), // Position in chain (0, 1, 2...)
    enabled: v.boolean(), // Bypass toggle
    effectData: v.union(
      v.object({
        type: v.literal("filter"),
        cutoff: v.number(), // 20-20000 Hz
        resonance: v.number(), // 0-1
        filterType: v.union(
          v.literal("lowpass"),
          v.literal("highpass"),
          v.literal("bandpass"),
          v.literal("notch")
        ),
      })
      // Future effects added as new union members
    ),
  })
    .index("by_track", ["trackId"])
    .index("by_track_order", ["trackId", "order"]),
```

**Step 2: Run type generation to verify schema**

Run: `cd packages/backend && npx convex dev --once`
Expected: Schema updates successfully, types regenerated

**Step 3: Commit**

```bash
git add packages/backend/convex/schema.ts
git commit -m "feat(backend): add trackEffects table schema"
```

---

## Task 2: Create trackEffects Convex Functions

**Files:**
- Create: `packages/backend/convex/trackEffects.ts`

**Step 1: Create the trackEffects module with all CRUD operations**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkQueryAccess, requireProjectAccess } from "./utils";

// Effect data validator (reusable)
const effectDataValidator = v.union(
  v.object({
    type: v.literal("filter"),
    cutoff: v.number(),
    resonance: v.number(),
    filterType: v.union(
      v.literal("lowpass"),
      v.literal("highpass"),
      v.literal("bandpass"),
      v.literal("notch")
    ),
  })
);

export const getTrackEffects = query({
  args: {
    trackId: v.id("tracks"),
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.trackId);
    if (!track) return [];

    const user = await checkQueryAccess(ctx, track.projectId);
    if (!user) return [];

    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track_order", (q) => q.eq("trackId", args.trackId))
      .collect();

    return effects.sort((a, b) => a.order - b.order);
  },
});

export const createEffect = mutation({
  args: {
    trackId: v.id("tracks"),
    effectData: effectDataValidator,
  },
  handler: async (ctx, args) => {
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    // Get highest order number
    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", args.trackId))
      .collect();

    const maxOrder = effects.reduce((max, e) => Math.max(max, e.order), -1);

    const effectId = await ctx.db.insert("trackEffects", {
      trackId: args.trackId,
      order: maxOrder + 1,
      enabled: true,
      effectData: args.effectData,
    });

    return effectId;
  },
});

export const updateEffect = mutation({
  args: {
    id: v.id("trackEffects"),
    enabled: v.optional(v.boolean()),
    effectData: v.optional(effectDataValidator),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    const updates: Record<string, unknown> = {};
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.effectData !== undefined) updates.effectData = args.effectData;

    await ctx.db.patch(args.id, updates);
  },
});

export const deleteEffect = mutation({
  args: {
    id: v.id("trackEffects"),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    // Delete the effect
    await ctx.db.delete(args.id);

    // Reorder remaining effects to close gaps
    const remainingEffects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", effect.trackId))
      .collect();

    const sorted = remainingEffects.sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].order !== i) {
        await ctx.db.patch(sorted[i]._id, { order: i });
      }
    }
  },
});

export const reorderEffect = mutation({
  args: {
    id: v.id("trackEffects"),
    newOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const effect = await ctx.db.get(args.id);
    if (!effect) throw new Error("Effect not found");

    const track = await ctx.db.get(effect.trackId);
    if (!track) throw new Error("Track not found");

    await requireProjectAccess(ctx, track.projectId);

    const oldOrder = effect.order;
    if (oldOrder === args.newOrder) return;

    // Get all effects for this track
    const effects = await ctx.db
      .query("trackEffects")
      .withIndex("by_track", (q) => q.eq("trackId", effect.trackId))
      .collect();

    // Update orders
    for (const e of effects) {
      if (e._id === args.id) {
        await ctx.db.patch(e._id, { order: args.newOrder });
      } else if (oldOrder < args.newOrder) {
        // Moving down: shift items in between up
        if (e.order > oldOrder && e.order <= args.newOrder) {
          await ctx.db.patch(e._id, { order: e.order - 1 });
        }
      } else {
        // Moving up: shift items in between down
        if (e.order >= args.newOrder && e.order < oldOrder) {
          await ctx.db.patch(e._id, { order: e.order + 1 });
        }
      }
    }
  },
});
```

**Step 2: Run type generation**

Run: `cd packages/backend && npx convex dev --once`
Expected: Types regenerated with trackEffects API

**Step 3: Commit**

```bash
git add packages/backend/convex/trackEffects.ts
git commit -m "feat(backend): add trackEffects CRUD mutations and query"
```

---

## Task 3: Add Effect Types to Audio Engine

**Files:**
- Modify: `packages/audio/src/engine.ts`

**Step 1: Add effect type definitions after ClipState interface**

```typescript
/**
 * Filter effect types matching Convex schema
 */
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";

export interface FilterEffectData {
  type: "filter";
  cutoff: number; // 20-20000 Hz
  resonance: number; // 0-1
  filterType: FilterType;
}

export type EffectData = FilterEffectData;

export interface TrackEffect {
  id: string;
  trackId: string;
  order: number;
  enabled: boolean;
  effectData: EffectData;
}
```

**Step 2: Update AudioEngineState to include effects**

```typescript
export interface AudioEngineState {
  tracks: TrackState[];
  clips: ClipState[];
  effects: TrackEffect[]; // Add this line
  masterGain: number;
}
```

**Step 3: Update the constructor to initialize effects**

In the constructor, update the state initialization:

```typescript
private state: AudioEngineState = {
  tracks: [],
  clips: [],
  effects: [], // Add this line
  masterGain: 0,
};
```

**Step 4: Add setEffects method after setClips**

```typescript
/**
 * Update effect states for all tracks
 */
setEffects(effects: TrackEffect[]): void {
  this.state.effects = effects;
  this.renderGraph();
}
```

**Step 5: Commit**

```bash
git add packages/audio/src/engine.ts
git commit -m "feat(audio): add effect types and setEffects method"
```

---

## Task 4: Implement Effect Chain Rendering in Audio Engine

**Files:**
- Modify: `packages/audio/src/engine.ts`

> **Important:** Use the `elementary-audio` skill to verify exact SVF API before implementation.

**Step 1: Add renderEffectChain method before renderGraph**

```typescript
/**
 * Render the effect chain for a track
 * Effects are applied in order, pre-fader
 */
private renderEffectChain(
  left: NodeRepr_t,
  right: NodeRepr_t,
  trackId: string,
  effects: TrackEffect[]
): { left: NodeRepr_t; right: NodeRepr_t } {
  let outputLeft = left;
  let outputRight = right;

  for (const effect of effects) {
    if (!effect.enabled) continue; // Bypass disabled effects

    const result = this.renderEffect(outputLeft, outputRight, effect);
    outputLeft = result.left;
    outputRight = result.right;
  }

  return { left: outputLeft, right: outputRight };
}

/**
 * Render a single effect
 */
private renderEffect(
  left: NodeRepr_t,
  right: NodeRepr_t,
  effect: TrackEffect
): { left: NodeRepr_t; right: NodeRepr_t } {
  const key = `effect-${effect.id}`;

  switch (effect.effectData.type) {
    case "filter":
      return this.renderFilter(left, right, effect.effectData, key);
    default:
      return { left, right };
  }
}

/**
 * Render SVF filter effect
 * Use elementary-audio skill to verify exact API
 */
private renderFilter(
  left: NodeRepr_t,
  right: NodeRepr_t,
  params: FilterEffectData,
  key: string
): { left: NodeRepr_t; right: NodeRepr_t } {
  // Smoothed parameters to prevent clicks
  const cutoff = el.sm(
    el.const({ key: `${key}-cutoff`, value: params.cutoff })
  );
  const res = el.sm(
    el.const({ key: `${key}-res`, value: params.resonance })
  );

  // SVF filter for left channel
  const svfLeft = el.svf(cutoff, res, left);
  // SVF filter for right channel
  const svfRight = el.svf(cutoff, res, right);

  // Select output based on filter type
  // el.svf returns an object with lp, hp, bp properties
  const getFilterOutput = (svf: any, filterType: FilterType): NodeRepr_t => {
    switch (filterType) {
      case "lowpass":
        return svf.lp;
      case "highpass":
        return svf.hp;
      case "bandpass":
        return svf.bp;
      case "notch":
        // Notch is lowpass + highpass combined
        return el.add(svf.lp, svf.hp);
      default:
        return svf.lp;
    }
  };

  return {
    left: getFilterOutput(svfLeft, params.filterType),
    right: getFilterOutput(svfRight, params.filterType),
  };
}
```

**Step 2: Update renderGraph to use effect chain**

In the `renderGraph` method, find the section where track signals are built (around line 454). After summing clips and before applying track gain, insert the effect chain:

Find this code block:
```typescript
// Sum all clips on this track (FR-21)
const { left: trackLeft, right: trackRight } = this.sumStereoSignals(
  clipSignals,
  `track-${track.id}`,
);

// Apply track gain with smoothing (FR-20)
```

Insert effect chain between them:
```typescript
// Sum all clips on this track (FR-21)
const { left: trackSumLeft, right: trackSumRight } = this.sumStereoSignals(
  clipSignals,
  `track-${track.id}`,
);

// Apply effect chain (pre-fader)
const trackEffects = this.state.effects
  .filter((e) => e.trackId === track.id)
  .sort((a, b) => a.order - b.order);

const { left: trackLeft, right: trackRight } = this.renderEffectChain(
  trackSumLeft,
  trackSumRight,
  track.id,
  trackEffects
);

// Apply track gain with smoothing (FR-20)
```

**Step 3: Run type check**

Run: `bun check-types`
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/audio/src/engine.ts
git commit -m "feat(audio): implement effect chain rendering with SVF filter"
```

---

## Task 5: Create Effect Types Export

**Files:**
- Modify: `packages/audio/src/index.ts` (if exists, otherwise create)

**Step 1: Export effect types from audio package**

Check if `packages/audio/src/index.ts` exists. If not, create it:

```typescript
export {
  AudioEngine,
  type AudioEngineState,
  type TrackState,
  type ClipState,
  type TrackEffect,
  type EffectData,
  type FilterEffectData,
  type FilterType,
  type VFSEntry,
  type MeterValue,
} from "./engine.js";

export { dbToGain, gainToDb, clampDb } from "./utils.js";
```

If it exists, add the new effect types to the exports.

**Step 2: Commit**

```bash
git add packages/audio/src/index.ts
git commit -m "feat(audio): export effect types from package"
```

---

## Task 6: Create EffectsPanel Component

**Files:**
- Create: `apps/web/src/components/EffectsPanel.tsx`

**Step 1: Create the collapsible bottom panel component**

```typescript
import { ChevronDown, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getTrackColor } from "@/lib/canvasRenderer";

interface EffectsPanelProps {
  selectedTrackId: string | null;
  selectedTrackName: string;
  selectedTrackIndex: number;
  onClose: () => void;
  children: React.ReactNode;
  onAddEffect: () => void;
}

export function EffectsPanel({
  selectedTrackId,
  selectedTrackName,
  selectedTrackIndex,
  onClose,
  children,
  onAddEffect,
}: EffectsPanelProps) {
  const trackColor = getTrackColor(selectedTrackIndex);

  if (!selectedTrackId) return null;

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-t bg-muted/20">
      {/* Panel Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/30 px-3">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-1 rounded-full"
            style={{ backgroundColor: trackColor }}
          />
          <span className="text-xs font-medium">{selectedTrackName} Effects</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* Effect Chain */}
      <div className="flex flex-1 items-center gap-2 overflow-x-auto p-3">
        {children}

        {/* Add Effect Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-[120px] w-[80px] shrink-0 flex-col gap-1 border-dashed"
          onClick={onAddEffect}
        >
          <Plus className="size-5" />
          <span className="text-[10px]">Add</span>
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/EffectsPanel.tsx
git commit -m "feat(frontend): create EffectsPanel component"
```

---

## Task 7: Create EffectCard Component

**Files:**
- Create: `apps/web/src/components/EffectCard.tsx`

**Step 1: Create the effect card component**

```typescript
import { GripVertical } from "lucide-react";
import { useCallback } from "react";

import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface EffectCardProps {
  id: string;
  name: string;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

export function EffectCard({
  id,
  name,
  enabled,
  selected,
  onSelect,
  onEnabledChange,
  onDragStart,
  onDragEnd,
  children,
}: EffectCardProps) {
  return (
    <div
      className={cn(
        "flex h-[120px] w-[140px] shrink-0 flex-col rounded border bg-background transition-colors",
        selected && "ring-2 ring-primary",
        !enabled && "opacity-60"
      )}
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/50 px-1.5">
        <div className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="size-3" />
        </div>
        <span className="flex-1 truncate text-[10px] font-medium">{name}</span>
        <Toggle
          size="sm"
          pressed={enabled}
          onPressedChange={onEnabledChange}
          className="h-5 w-5 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn("size-2 rounded-full", enabled ? "bg-current" : "border border-current")} />
        </Toggle>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 p-2">
        {children}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/EffectCard.tsx
git commit -m "feat(frontend): create EffectCard component"
```

---

## Task 8: Create FilterEffect Component

**Files:**
- Create: `apps/web/src/components/effects/FilterEffect.tsx`

**Step 1: Create the filter effect UI component**

```typescript
import { useCallback } from "react";

import { useOptimisticControl } from "@/hooks/useOptimisticControl";
import { Knob } from "@/components/ui/knob";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";

interface FilterEffectProps {
  cutoff: number;
  resonance: number;
  filterType: FilterType;
  onCutoffChange: (value: number) => void;
  onCutoffCommit: (value: number) => void;
  onResonanceChange: (value: number) => void;
  onResonanceCommit: (value: number) => void;
  onFilterTypeChange: (type: FilterType) => void;
}

const filterTypeLabels: Record<FilterType, string> = {
  lowpass: "LP",
  highpass: "HP",
  bandpass: "BP",
  notch: "Notch",
};

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(1)}k`;
  }
  return `${Math.round(hz)}`;
}

export function FilterEffect({
  cutoff,
  resonance,
  filterType,
  onCutoffChange,
  onCutoffCommit,
  onResonanceChange,
  onResonanceCommit,
  onFilterTypeChange,
}: FilterEffectProps) {
  // Optimistic control for cutoff
  const {
    localValue: localCutoff,
    handleChange: handleCutoffChange,
    handleCommit: handleCutoffCommit,
  } = useOptimisticControl({
    serverValue: cutoff,
    onChange: onCutoffChange,
    onCommit: onCutoffCommit,
  });

  // Optimistic control for resonance
  const {
    localValue: localResonance,
    handleChange: handleResonanceChange,
    handleCommit: handleResonanceCommit,
  } = useOptimisticControl({
    serverValue: resonance,
    onChange: onResonanceChange,
    onCommit: onResonanceCommit,
  });

  return (
    <div className="flex flex-col gap-1.5">
      {/* Filter Type Selector */}
      <Select value={filterType} onValueChange={(v) => onFilterTypeChange(v as FilterType)}>
        <SelectTrigger className="h-6 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="lowpass">Lowpass</SelectItem>
          <SelectItem value="highpass">Highpass</SelectItem>
          <SelectItem value="bandpass">Bandpass</SelectItem>
          <SelectItem value="notch">Notch</SelectItem>
        </SelectContent>
      </Select>

      {/* Knobs Row */}
      <div className="flex items-center justify-around">
        <div className="flex flex-col items-center gap-0.5">
          <Knob
            value={localCutoff}
            min={20}
            max={20000}
            step={1}
            size={28}
            onChange={handleCutoffChange}
            onCommit={handleCutoffCommit}
          />
          <span className="text-[9px] text-muted-foreground">{formatFrequency(localCutoff)}</span>
          <span className="text-[8px] text-muted-foreground/70">Freq</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Knob
            value={localResonance}
            min={0}
            max={1}
            step={0.01}
            size={28}
            onChange={handleResonanceChange}
            onCommit={handleResonanceCommit}
          />
          <span className="text-[9px] text-muted-foreground">{localResonance.toFixed(2)}</span>
          <span className="text-[8px] text-muted-foreground/70">Res</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/effects/FilterEffect.tsx
git commit -m "feat(frontend): create FilterEffect component with knobs"
```

---

## Task 9: Create AddEffectDialog Component

**Files:**
- Create: `apps/web/src/components/AddEffectDialog.tsx`

**Step 1: Create the add effect dialog**

```typescript
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EffectType = "filter";

interface AddEffectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectEffect: (type: EffectType) => void;
}

interface EffectOption {
  type: EffectType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const effectOptions: EffectOption[] = [
  {
    type: "filter",
    name: "Filter",
    description: "SVF filter with lowpass, highpass, bandpass, and notch modes",
    icon: <SlidersHorizontal className="size-6" />,
  },
  // Future effects will be added here
];

export function AddEffectDialog({
  open,
  onOpenChange,
  onSelectEffect,
}: AddEffectDialogProps) {
  const handleSelect = (type: EffectType) => {
    onSelectEffect(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Effect</DialogTitle>
          <DialogDescription>Choose an effect to add to the chain</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {effectOptions.map((option) => (
            <Button
              key={option.type}
              variant="outline"
              className="h-auto justify-start gap-3 p-3"
              onClick={() => handleSelect(option.type)}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                {option.icon}
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/AddEffectDialog.tsx
git commit -m "feat(frontend): create AddEffectDialog component"
```

---

## Task 10: Create Select UI Component

**Files:**
- Create: `apps/web/src/components/ui/select.tsx`

**Step 1: Check if select component exists, if not create it**

If the file doesn't exist, create a select component using Base UI:

```typescript
import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Select({ ...props }: SelectPrimitive.Root.Props) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-8 w-full items-center justify-between rounded border bg-background px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-3.5 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative z-50 min-w-[8rem] overflow-hidden rounded border bg-background text-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center py-1.5 pl-8 pr-2 text-xs outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
```

**Step 2: Commit**

```bash
git add apps/web/src/components/ui/select.tsx
git commit -m "feat(frontend): create Select component"
```

---

## Task 11: Create useEffectReorder Hook

**Files:**
- Create: `apps/web/src/hooks/useEffectReorder.ts`

**Step 1: Create the effect reorder hook**

```typescript
import { useCallback, useState } from "react";

interface Effect {
  _id: string;
  order: number;
}

interface UseEffectReorderOptions {
  effects: Effect[];
  onReorder: (effectId: string, newOrder: number) => void;
}

export function useEffectReorder({ effects, onReorder }: UseEffectReorderOptions) {
  const [draggedEffectId, setDraggedEffectId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, effectId: string) => {
    setDraggedEffectId(effectId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", effectId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEffectId(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedEffectId === null) return;

      const draggedEffect = effects.find((e) => e._id === draggedEffectId);
      if (!draggedEffect) return;

      // Calculate drop position based on mouse position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const dropIndex = e.clientX < midpoint ? index : index + 1;

      setDropTargetIndex(dropIndex);
    },
    [draggedEffectId, effects]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedEffectId === null || dropTargetIndex === null) return;

      const draggedEffect = effects.find((e) => e._id === draggedEffectId);
      if (!draggedEffect) return;

      // Calculate actual new order
      let newOrder = dropTargetIndex;
      if (draggedEffect.order < dropTargetIndex) {
        newOrder = dropTargetIndex - 1;
      }

      if (newOrder !== draggedEffect.order) {
        onReorder(draggedEffectId, newOrder);
      }

      setDraggedEffectId(null);
      setDropTargetIndex(null);
    },
    [draggedEffectId, dropTargetIndex, effects, onReorder]
  );

  return {
    draggedEffectId,
    dropTargetIndex,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useEffectReorder.ts
git commit -m "feat(frontend): create useEffectReorder hook"
```

---

## Task 12: Integrate Effects Panel into Project Editor

**Files:**
- Modify: `apps/web/src/routes/project.$id.tsx`

**Step 1: Add imports at top of file**

```typescript
import { api } from "@el-audio-daw/backend/convex/_generated/api";
// ... existing imports ...

// Add these imports:
import { EffectsPanel } from "@/components/EffectsPanel";
import { EffectCard } from "@/components/EffectCard";
import { FilterEffect } from "@/components/effects/FilterEffect";
import { AddEffectDialog } from "@/components/AddEffectDialog";
import { useEffectReorder } from "@/hooks/useEffectReorder";
```

**Step 2: Add track selection state in ProjectEditor function**

After existing state declarations:

```typescript
// Track selection for effects panel
const [selectedTrackIdForEffects, setSelectedTrackIdForEffects] = useState<string | null>(null);
const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
const [addEffectDialogOpen, setAddEffectDialogOpen] = useState(false);
```

**Step 3: Add effects query and mutations**

After existing queries:

```typescript
// Effects query - only fetch when a track is selected
const effects = useQuery(
  api.trackEffects.getTrackEffects,
  selectedTrackIdForEffects ? { trackId: selectedTrackIdForEffects as any } : "skip"
);

// Effect mutations
const createEffect = useMutation(api.trackEffects.createEffect);
const updateEffect = useMutation(api.trackEffects.updateEffect);
const deleteEffect = useMutation(api.trackEffects.deleteEffect);
const reorderEffect = useMutation(api.trackEffects.reorderEffect);
```

**Step 4: Add effect handlers**

```typescript
// Handle track header click for effects panel
const handleTrackSelect = useCallback((trackId: string) => {
  setSelectedTrackIdForEffects((prev) => (prev === trackId ? null : trackId));
  setSelectedEffectId(null);
}, []);

// Handle adding an effect
const handleAddEffect = useCallback(
  async (type: "filter") => {
    if (!selectedTrackIdForEffects) return;

    const defaultEffectData =
      type === "filter"
        ? { type: "filter" as const, cutoff: 1000, resonance: 0.5, filterType: "lowpass" as const }
        : null;

    if (!defaultEffectData) return;

    await createEffect({
      trackId: selectedTrackIdForEffects as any,
      effectData: defaultEffectData,
    });
  },
  [selectedTrackIdForEffects, createEffect]
);

// Handle effect parameter updates (real-time for audio engine)
const handleEffectParamChange = useCallback(
  (effectId: string, effectData: any) => {
    // Update audio engine immediately for real-time feedback
    // (This will be connected to audio engine in next task)
  },
  []
);

// Handle effect parameter commit (to server)
const handleEffectParamCommit = useCallback(
  async (effectId: string, effectData: any) => {
    await updateEffect({
      id: effectId as any,
      effectData,
    });
  },
  [updateEffect]
);

// Handle effect enabled toggle
const handleEffectEnabledChange = useCallback(
  async (effectId: string, enabled: boolean) => {
    await updateEffect({
      id: effectId as any,
      enabled,
    });
  },
  [updateEffect]
);

// Handle effect deletion via keyboard
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedEffectId) {
      e.preventDefault();
      void deleteEffect({ id: selectedEffectId as any });
      setSelectedEffectId(null);
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [selectedEffectId, deleteEffect]);

// Effect reorder hook
const {
  draggedEffectId,
  dropTargetIndex,
  handleDragStart: handleEffectDragStart,
  handleDragEnd: handleEffectDragEnd,
  handleDragOver: handleEffectDragOver,
  handleDrop: handleEffectDrop,
} = useEffectReorder({
  effects: effects ?? [],
  onReorder: (effectId, newOrder) => {
    void reorderEffect({ id: effectId as any, newOrder });
  },
});
```

**Step 5: Update VirtualizedTrackList to support selection**

Find the VirtualizedTrackList component and add an onClick handler prop. This requires modifying VirtualizedTrackList - but for now, we can use the existing track header structure. We'll need to modify the component in a separate task.

For now, add a click handler wrapper around the track list section.

**Step 6: Update the layout JSX**

Find the main content area div and update it to include the effects panel:

```typescript
{/* Main Content Area */}
<div className="flex min-h-0 flex-1 flex-col">
  <div className="flex min-h-0 flex-1">
    {/* Track List */}
    <div className="flex w-64 shrink-0 flex-col border-r">
      {/* ... existing track list code ... */}
    </div>

    {/* Timeline Area */}
    <div className="flex flex-1 flex-col">
      {/* ... existing timeline code ... */}
    </div>
  </div>

  {/* Effects Panel */}
  {selectedTrackIdForEffects && (
    <EffectsPanel
      selectedTrackId={selectedTrackIdForEffects}
      selectedTrackName={
        tracks?.find((t) => t._id === selectedTrackIdForEffects)?.name ?? "Track"
      }
      selectedTrackIndex={
        tracks?.findIndex((t) => t._id === selectedTrackIdForEffects) ?? 0
      }
      onClose={() => setSelectedTrackIdForEffects(null)}
      onAddEffect={() => setAddEffectDialogOpen(true)}
    >
      {(effects ?? []).map((effect, index) => (
        <EffectCard
          key={effect._id}
          id={effect._id}
          name={effect.effectData.type === "filter" ? "Filter" : "Effect"}
          enabled={effect.enabled}
          selected={selectedEffectId === effect._id}
          onSelect={() => setSelectedEffectId(effect._id)}
          onEnabledChange={(enabled) => handleEffectEnabledChange(effect._id, enabled)}
          onDragStart={(e) => handleEffectDragStart(e, effect._id)}
          onDragEnd={handleEffectDragEnd}
        >
          {effect.effectData.type === "filter" && (
            <FilterEffect
              cutoff={effect.effectData.cutoff}
              resonance={effect.effectData.resonance}
              filterType={effect.effectData.filterType}
              onCutoffChange={(v) =>
                handleEffectParamChange(effect._id, { ...effect.effectData, cutoff: v })
              }
              onCutoffCommit={(v) =>
                handleEffectParamCommit(effect._id, { ...effect.effectData, cutoff: v })
              }
              onResonanceChange={(v) =>
                handleEffectParamChange(effect._id, { ...effect.effectData, resonance: v })
              }
              onResonanceCommit={(v) =>
                handleEffectParamCommit(effect._id, { ...effect.effectData, resonance: v })
              }
              onFilterTypeChange={(type) =>
                handleEffectParamCommit(effect._id, { ...effect.effectData, filterType: type })
              }
            />
          )}
        </EffectCard>
      ))}
    </EffectsPanel>
  )}

  {/* Add Effect Dialog */}
  <AddEffectDialog
    open={addEffectDialogOpen}
    onOpenChange={setAddEffectDialogOpen}
    onSelectEffect={handleAddEffect}
  />
</div>
```

**Step 7: Run type check**

Run: `bun check-types`
Expected: No type errors (may need adjustments)

**Step 8: Commit**

```bash
git add apps/web/src/routes/project.$id.tsx
git commit -m "feat(frontend): integrate effects panel into project editor"
```

---

## Task 13: Add Track Selection Click Handler to VirtualizedTrackList

**Files:**
- Modify: `apps/web/src/components/VirtualizedTrackList.tsx`

**Step 1: Add onTrackSelect prop to interfaces**

Update TrackHeaderProps:
```typescript
interface TrackHeaderProps {
  // ... existing props ...
  onTrackSelect: () => void;
}
```

Update VirtualizedTrackListProps:
```typescript
export interface VirtualizedTrackListProps {
  // ... existing props ...
  onTrackSelect: (trackId: string) => void;
  selectedTrackId?: string | null;
}
```

**Step 2: Add click handler to TrackHeader**

Wrap the main content area with a click handler:

```typescript
function TrackHeader({
  // ... existing props ...
  onTrackSelect,
}: TrackHeaderProps) {
  // ... existing code ...

  return (
    <div
      className={`box-border flex h-[100px] cursor-pointer border-b transition-all duration-150 ${isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""}`}
      draggable={isDragHandleActive}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setIsDragHandleActive(false);
        onDragEnd();
      }}
      onClick={onTrackSelect}
    >
      {/* ... existing JSX ... */}
    </div>
  );
}
```

**Step 3: Pass the handler through VirtualizedTrackList**

Update the component to accept and pass onTrackSelect:

```typescript
export const VirtualizedTrackList = React.forwardRef<HTMLDivElement, VirtualizedTrackListProps>(
  function VirtualizedTrackList(
    {
      // ... existing props ...
      onTrackSelect,
      selectedTrackId,
    },
    ref,
  ) {
    // ... existing code ...

    return (
      // ... in the map function, add to TrackHeader:
      <TrackHeader
        // ... existing props ...
        onTrackSelect={() => onTrackSelect(track._id)}
      />
    );
  },
);
```

**Step 4: Add visual indicator for selected track**

In TrackHeader, add selected state visual:

```typescript
const isSelected = selectedTrackId === track._id;

// Update the main div className:
className={`box-border flex h-[100px] cursor-pointer border-b transition-all duration-150 ${
  isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""
} ${isSelected ? "bg-accent/30" : ""}`}
```

**Step 5: Commit**

```bash
git add apps/web/src/components/VirtualizedTrackList.tsx
git commit -m "feat(frontend): add track selection support to VirtualizedTrackList"
```

---

## Task 14: Connect Effects to Audio Engine

**Files:**
- Modify: `apps/web/src/routes/project.$id.tsx`
- Modify: `apps/web/src/hooks/useAudioEngine.ts`

**Step 1: Update useAudioEngine hook to accept effects**

Check the current useAudioEngine hook structure and add effects support. The hook should accept effects and pass them to the engine.

**Step 2: Transform Convex effects to engine format**

In project.$id.tsx, add transformation of effects data:

```typescript
// Transform effects for audio engine
const engineEffects = useMemo(() => {
  if (!effects) return [];
  return effects.map((e) => ({
    id: e._id,
    trackId: e.trackId,
    order: e.order,
    enabled: e.enabled,
    effectData: e.effectData,
  }));
}, [effects]);
```

**Step 3: Pass effects to audio engine**

Update the useEffect that syncs state to the engine:

```typescript
useEffect(() => {
  if (!audioEngine) return;
  audioEngine.setEffects(engineEffects);
}, [audioEngine, engineEffects]);
```

**Step 4: Commit**

```bash
git add apps/web/src/routes/project.$id.tsx apps/web/src/hooks/useAudioEngine.ts
git commit -m "feat(frontend): connect effects state to audio engine"
```

---

## Task 15: Test and Verify

**Step 1: Start the development server**

Run: `bun dev`

**Step 2: Manual testing checklist**

- [ ] Create a new track
- [ ] Click on track header - effects panel should open
- [ ] Click "Add" button - dialog should appear
- [ ] Select "Filter" - filter effect should appear in chain
- [ ] Adjust cutoff knob - audio should change in real-time
- [ ] Adjust resonance knob - audio should change in real-time
- [ ] Change filter type - audio should change
- [ ] Toggle bypass - effect should bypass
- [ ] Click on effect card - should show selection
- [ ] Press Delete key - effect should be deleted
- [ ] Add multiple effects - should appear in order
- [ ] Drag to reorder - order should update
- [ ] Click same track header again - panel should close
- [ ] Click different track - panel should switch

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete effect chain system with filter effect"
```

---

## Summary

This plan implements:
1. Convex schema for `trackEffects` table with discriminated union types
2. CRUD mutations and queries for effects
3. Audio engine effect chain rendering (pre-fader)
4. SVF filter implementation
5. Collapsible effects panel UI
6. Effect card component with bypass toggle
7. Filter effect UI with cutoff/resonance knobs
8. Add effect dialog
9. Drag-to-reorder effects
10. Delete effect via keyboard
11. Track selection for effects panel

Total: 15 tasks, each with discrete steps.
