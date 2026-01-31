# Effect Chain System Design

## Overview

Add a per-track effect chain system with a bottom panel UI, similar to Ableton Live's device chain. Effects process audio sequentially (left-to-right) in a pre-fader configuration.

## Signal Flow

```
Clips → Track Sum → Effects Chain → Track Gain → Pan → Master
```

Effects are inserted **pre-fader** - before track gain and panning. This ensures effect levels stay consistent regardless of track volume.

## Data Model

### New Convex Table: `trackEffects`

```typescript
trackEffects: defineTable({
  trackId: v.id("tracks"),
  order: v.number(),           // Position in chain (0, 1, 2...)
  enabled: v.boolean(),        // Bypass toggle
  effectData: v.union(
    v.object({
      type: v.literal("filter"),
      cutoff: v.number(),      // 20-20000 Hz
      resonance: v.number(),   // 0-1
      filterType: v.union(
        v.literal("lowpass"),
        v.literal("highpass"),
        v.literal("bandpass"),
        v.literal("notch")
      ),
    }),
    // Future effects added as new union members
  ),
})
.index("by_track", ["trackId"])
.index("by_track_order", ["trackId", "order"])
```

### Backend Mutations

- `createEffect(trackId, effectData)` - Adds effect at end of chain
- `updateEffect(effectId, updates)` - Update params or enabled state
- `deleteEffect(effectId)` - Remove and reorder remaining
- `reorderEffect(effectId, newOrder)` - Move effect in chain

### Query

- `getTrackEffects(trackId)` - Returns effects ordered by `order` field

## Audio Engine Integration

### Engine Changes (`packages/audio/src/engine.ts`)

Add effect chain rendering between track sum and track gain:

```typescript
private renderEffectChain(
  signal: NodeRepr_t,
  trackId: string,
  effects: TrackEffect[]
): NodeRepr_t {
  let output = signal;

  for (const effect of effects) {
    if (!effect.enabled) continue; // Bypass
    output = this.renderEffect(output, effect, trackId);
  }

  return output;
}

private renderEffect(
  signal: NodeRepr_t,
  effect: TrackEffect,
  trackId: string
): NodeRepr_t {
  const key = `${trackId}-effect-${effect.id}`;

  switch (effect.effectData.type) {
    case "filter":
      return this.renderFilter(signal, effect.effectData, key);
    // Future effects...
  }
}
```

### Filter Implementation (SVF)

Use Elementary Audio's SVF (State Variable Filter) for maximum versatility:

```typescript
private renderFilter(signal: NodeRepr_t, params: FilterParams, key: string) {
  const cutoff = el.sm(el.const({ key: `${key}-cutoff`, value: params.cutoff }));
  const res = el.sm(el.const({ key: `${key}-res`, value: params.resonance }));

  const svf = el.svf(cutoff, res, signal);
  return svf[params.filterType]; // lp, hp, bp, or notch
}
```

> **Note:** Use `elementary-audio` skill during implementation to verify exact SVF API and parameter handling.

## UI Design

### Bottom Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Track Headers │          Timeline Canvas                    │
│               │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ ▼ Track 1 Effects                                      [X]  │  ← Panel header
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────┐             │
│ │ Filter  │  │ Delay   │  │ Reverb  │  │  +  │             │  ← Effect chain
│ │ ○ [LPF] │  │ ...     │  │ ...     │  │     │             │
│ │ Cutoff  │  │         │  │         │  └─────┘             │
│ │ Res     │  │         │  │         │                      │
│ └─────────┘  └─────────┘  └─────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Panel Behavior

- **Collapsed by default** - No panel visible initially
- **Open on track select** - Click track header → panel expands showing that track's effects
- **Toggle closed** - Click same track again OR click close button [X]
- **Switch tracks** - Click different track → panel stays open, content switches
- **Fixed height** - ~150-200px

### Effect Card Component

```
┌─────────────────────────┐
│ ● Filter            ▼  │  ← Header: bypass toggle, name
├─────────────────────────┤
│  Type: [Lowpass ▼]      │  ← Filter type dropdown
│                         │
│  Cutoff    Resonance    │
│  ┌─────┐   ┌─────┐      │  ← Knobs for parameters
│  │     │   │     │      │
│  └─────┘   └─────┘      │
│  1.2 kHz     0.50       │  ← Value readouts
└─────────────────────────┘
```

### Effect Card Behavior

- **Click anywhere on card** → Selects effect (highlight border)
- **Press Delete key** → Removes selected effect (no confirmation)
- **Drag header** → Reorder in chain
- **Bypass toggle (●/○)** → Enable/disable effect inline

### Add Effect Dialog

- Opens on "+" button click
- Lists available effects (initially just "Filter")
- Grouped by category when more effects are added
- Click effect → Creates with default values

## State Management

### Selection State

- `selectedTrackId` - Which track's effects are shown (controls panel open/closed)
- `selectedEffectId` - Which effect is selected for deletion (local UI state)

### Data Flow

```
User clicks track header
       ↓
selectedTrackId updates → Panel opens
       ↓
useQuery fetches effects for that track
       ↓
Effects render in panel
       ↓
User adjusts knob → Local state + Audio engine (real-time)
       ↓
User releases knob → Convex mutation (commit)
```

### Optimistic Updates

Follow existing pattern for track controls:
- Local state for immediate audio engine response
- Commit to Convex only on control release
- Rollback on mutation error

## Scope

### Included

1. **Backend (Convex)**
   - New `trackEffects` table with discriminated union
   - CRUD mutations + reorder function

2. **Audio Engine**
   - Effect chain rendering between track sum and gain
   - SVF filter implementation
   - Parameter smoothing for real-time updates

3. **Frontend**
   - Track selection state
   - Collapsible bottom panel component
   - Effect chain display (horizontal, left-to-right)
   - Effect card component with bypass, parameters, selection
   - Drag-to-reorder effects
   - "Add Effect" dialog
   - Filter effect UI (type selector, cutoff knob, resonance knob)
   - Delete selected effect on keypress

### Not Included (Future)

- Additional effect types (delay, reverb, etc.)
- Copy/paste effects
- Effect presets
- Undo/redo
