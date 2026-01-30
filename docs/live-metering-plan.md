# Live Metering Implementation Plan

This document outlines the approach for implementing real-time audio metering using Elementary Audio's `el.meter()`, displayed alongside the gain slider in the track header (similar to Ableton Live's mixer).

## Research Summary

### Traditional DAW Approaches

- **Ableton ASD files**: Store pre-computed waveform data for fast display
- **Pro Tools WaveCache (.WFM)**: Session-level cache for waveform visualization
- **Common pattern**: Min/max peak pairs per sample group (e.g., 256-512 samples)

### Elementary Audio Analysis Capabilities

- `el.meter(props, x)`: Pass-through node that emits `{ source, min, max }` events per audio block
- `el.scope(props, ...children)`: Buffers raw samples for oscilloscope-style visualization
- `el.fft(props, x)`: Frequency domain analysis

For live metering during playback, `el.meter()` is the ideal choice.

---

## Architecture

### Current Audio Graph

```
Clips → Track Sum → Track Gain (el.sm()) → Master Sum → Master Gain → Output
```

### Proposed Audio Graph

```
Clips → Track Sum → Track Gain (el.sm()) → el.meter() → Master Sum → Master Gain → el.meter() → Output
```

---

## Implementation Steps

### 1. Audio Engine Changes (`packages/audio/src/engine.ts`)

#### 1.1 Add Meter Event Handling

```typescript
// New private fields
private meterValues: Map<string, { min: number; max: number }> = new Map();
private meterCallbacks: Set<(meters: Map<string, { min: number; max: number }>) => void> = new Set();

// In initialize(), after core setup:
this.core.on('meter', (e) => {
  this.meterValues.set(e.source, { min: e.min, max: e.max });
});

// New public method
onMeterUpdate(callback: (meters: Map<string, { min: number; max: number }>) => void): () => void {
  this.meterCallbacks.add(callback);
  return () => this.meterCallbacks.delete(callback);
}
```

#### 1.2 Emit Batched Meter Values in rAF Loop

Modify `startPlayheadUpdates()` to also notify meter listeners:

```typescript
private startPlayheadUpdates(): void {
  const update = () => {
    if (!this.playing) return;

    this.playheadPosition = this.getPlayhead();
    this.notifyPlayheadListeners();

    // Notify meter listeners with batched values
    if (this.meterValues.size > 0) {
      for (const callback of this.meterCallbacks) {
        callback(this.meterValues);
      }
    }

    this.animationFrameId = requestAnimationFrame(update);
  };

  this.animationFrameId = requestAnimationFrame(update);
}
```

#### 1.3 Add Meters to Track Rendering

In `renderGraph()`, wrap track output with `el.meter()`:

```typescript
// After applying track gain (around line 550-557)
const gainedLeft = el.mul(smoothedGain, trackLeft);
const gainedRight = el.mul(smoothedGain, trackRight);

// Add metering (post-fader)
const meteredLeft = el.meter({ name: `track-${track.id}-L` }, gainedLeft);
const meteredRight = el.meter({ name: `track-${track.id}-R` }, gainedRight);

return {
  left: meteredLeft,
  right: meteredRight,
};
```

#### 1.4 Add Master Meter

Before final render:

```typescript
const masterLeftMetered = el.meter({ name: 'master-L' }, masterLeft);
const masterRightMetered = el.meter({ name: 'master-R' }, masterRight);

this.core.render(masterLeftMetered, masterRightMetered);
```

---

### 2. React Hook (`apps/web/src/hooks/useMeterValues.ts`)

Create a hook that subscribes to meter updates and provides a way to get current values without causing re-renders:

```typescript
import { useEffect, useRef } from 'react';
import type { AudioEngine } from '@audio/engine';

export interface MeterValue {
  min: number;
  max: number;
}

export function useMeterValues(engine: AudioEngine | null) {
  const metersRef = useRef<Map<string, MeterValue>>(new Map());
  const listenersRef = useRef<Map<string, (value: MeterValue) => void>>(new Map());

  useEffect(() => {
    if (!engine) return;

    const unsubscribe = engine.onMeterUpdate((meters) => {
      metersRef.current = meters;

      // Notify per-track listeners
      for (const [source, value] of meters) {
        const listener = listenersRef.current.get(source);
        if (listener) {
          listener(value);
        }
      }
    });

    return unsubscribe;
  }, [engine]);

  // Subscribe a specific meter (e.g., "track-123-L")
  const subscribe = (source: string, callback: (value: MeterValue) => void) => {
    listenersRef.current.set(source, callback);
    return () => listenersRef.current.delete(source);
  };

  return { subscribe };
}
```

---

### 3. UI Component Changes

#### 3.1 Meter Context Provider

Create a context to provide meter subscriptions to track components:

```typescript
// apps/web/src/contexts/MeterContext.tsx
import { createContext, useContext } from 'react';
import type { MeterValue } from '@/hooks/useMeterValues';

interface MeterContextValue {
  subscribe: (source: string, callback: (value: MeterValue) => void) => () => void;
}

export const MeterContext = createContext<MeterContextValue | null>(null);

export function useMeterSubscription() {
  const context = useContext(MeterContext);
  if (!context) {
    throw new Error('useMeterSubscription must be used within MeterProvider');
  }
  return context;
}
```

#### 3.2 Track Meter Component

Create a dedicated meter component that updates via refs (no React re-renders):

```typescript
// apps/web/src/components/TrackMeter.tsx
import { useEffect, useRef } from 'react';
import { useMeterSubscription } from '@/contexts/MeterContext';

interface TrackMeterProps {
  trackId: string;
}

export function TrackMeter({ trackId }: TrackMeterProps) {
  const { subscribe } = useMeterSubscription();
  const meterLeftRef = useRef<HTMLDivElement>(null);
  const meterRightRef = useRef<HTMLDivElement>(null);

  // Smoothed display values for decay effect
  const displayLeftRef = useRef(0);
  const displayRightRef = useRef(0);

  const SMOOTHING = 0.85; // Decay factor (higher = slower decay)
  const MIN_DB = -60;

  useEffect(() => {
    const unsubLeft = subscribe(`track-${trackId}-L`, (value) => {
      if (!meterLeftRef.current) return;

      // Convert to dB-ish scale (0-1 range for display)
      const peakDb = 20 * Math.log10(Math.max(Math.abs(value.max), Math.abs(value.min), 0.0001));
      const normalized = Math.max(0, (peakDb - MIN_DB) / -MIN_DB);

      // Apply smoothing (hold peaks, decay smoothly)
      displayLeftRef.current = Math.max(normalized, displayLeftRef.current * SMOOTHING);

      meterLeftRef.current.style.transform = `scaleX(${displayLeftRef.current})`;
    });

    const unsubRight = subscribe(`track-${trackId}-R`, (value) => {
      if (!meterRightRef.current) return;

      const peakDb = 20 * Math.log10(Math.max(Math.abs(value.max), Math.abs(value.min), 0.0001));
      const normalized = Math.max(0, (peakDb - MIN_DB) / -MIN_DB);

      displayRightRef.current = Math.max(normalized, displayRightRef.current * SMOOTHING);

      meterRightRef.current.style.transform = `scaleX(${displayRightRef.current})`;
    });

    return () => {
      unsubLeft();
      unsubRight();
    };
  }, [trackId, subscribe]);

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-px overflow-hidden rounded">
      <div
        ref={meterLeftRef}
        className="h-1.5 origin-left bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 will-change-transform"
        style={{ transform: 'scaleX(0)' }}
      />
      <div
        ref={meterRightRef}
        className="h-1.5 origin-left bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 will-change-transform"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}
```

#### 3.3 Integrate into TrackHeader

Modify `VirtualizedTrackList.tsx` to include the meter behind the slider:

```typescript
// In the Controls Row section
<div className="relative flex-1">
  {/* Meter bars - positioned behind slider */}
  <TrackMeter trackId={track._id} />

  {/* Slider - on top with transparent track */}
  <Slider
    className="relative z-10 mx-1"
    min={-60}
    max={12}
    step={0.1}
    value={[localGain]}
    onValueChange={(val) => handleGainChange(Array.isArray(val) ? (val[0] ?? 0) : val)}
    onValueCommit={handleGainCommit}
  />
</div>
```

---

### 4. Visual Design

#### Meter Layout (Ableton-style)

```
┌──────────────────────────────────────────────┐
│ [M] [S] ████████████░░░░░░░|░░░░░░░░  +0.0dB │
│         ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░         │  ← L channel
│         ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░         │  ← R channel
└──────────────────────────────────────────────┘
         └─ Meter gradient ─┘  │
                               └─ Slider thumb
```

#### Color Gradient

- **Green** (-60dB to -12dB): Safe levels
- **Yellow** (-12dB to -3dB): Getting hot
- **Red** (-3dB to 0dB): Near clipping

#### CSS for Gradient

```css
.meter-bar {
  background: linear-gradient(
    to right,
    #22c55e 0%,      /* green-500 */
    #22c55e 70%,
    #eab308 85%,     /* yellow-500 */
    #ef4444 100%     /* red-500 */
  );
}
```

---

## Performance Considerations

| Technique                 | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `el.meter()` in DSP graph | Native-speed metering, no JS audio processing     |
| Batch events in Map       | Single data structure vs. many individual events  |
| rAF-synced updates        | Cap at 60fps, sync with display refresh           |
| CSS `transform: scaleX`   | GPU-composited animation, no layout thrashing     |
| Direct DOM via refs       | Bypass React reconciliation entirely              |
| `will-change: transform`  | Hint browser to optimize compositing layer        |
| Per-track subscription    | Only update visible tracks (virtualization-aware) |

### Expected Performance

- **20 tracks**: ~40 meter sources (L+R each)
- **Audio block rate**: ~86 events/sec at 512 samples/44.1kHz
- **Total events**: ~3,400/sec → batched to 60 updates/sec
- **DOM updates**: 40 `transform` changes per frame (GPU-accelerated)

---

## Future Enhancements

1. **Peak hold indicator**: Show a small line at the highest peak that decays slowly
2. **Clip indicator**: Flash red when signal exceeds 0dB
3. **RMS metering**: Add optional RMS display alongside peak (use `el.snapshot` with smoothed RMS)
4. **Master meter**: Larger meter display in the master section
5. **Waveform overview**: Pre-compute peaks for clip visualization (separate from live metering)

---

## Files to Create/Modify

| File                                               | Action                             |
| -------------------------------------------------- | ---------------------------------- |
| `packages/audio/src/engine.ts`                     | Add meter nodes and event handling |
| `apps/web/src/hooks/useMeterValues.ts`             | New hook for meter subscriptions   |
| `apps/web/src/contexts/MeterContext.tsx`           | New context for meter distribution |
| `apps/web/src/components/TrackMeter.tsx`           | New meter UI component             |
| `apps/web/src/components/VirtualizedTrackList.tsx` | Integrate TrackMeter               |
| `apps/web/src/components/ui/slider.tsx`            | May need transparent track variant |
