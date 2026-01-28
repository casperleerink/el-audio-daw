# Sequencing & Control

## Table of Contents

- [el.seq](#elseqpropstreset) - Simple sequencer
- [el.seq2](#elseq2propstreset) - Improved sequencer
- [el.sparseq](#elsparseqpropstreset) - Sparse time-based sequencer
- [el.sparseq2](#elsparseq2propst) - Time-input sequencer
- [el.metro](#elmetroprops) - Metronome with events
- [el.counter](#elcounterg) - Sample counter
- [el.accum](#elaccumxnreset) - Accumulator

---

## el.seq(props, t, reset)

Simple signal sequencer. Steps through values on each rising edge of pulse train.

```js
// Step through values every beat
el.seq({seq: [1, 0, 0.5, 0.25]}, el.train(2), 0)

// Drum trigger pattern
el.seq({seq: [1, 0, 0, 0, 1, 0, 0, 0]}, el.train(8), 0)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seq | [] | Array | Values to sequence through |
| offset | 0 | Number | Position to return to on reset |
| hold | false | Bool | Hold value until next trigger |
| loop | true | Bool | Loop back to start at end |

**Parameters:**

- `t`: Pulse train to advance steps
- `reset`: Pulse train to reset position

---

## el.seq2(props, t, reset)

Improved sequencer with more robust reset behavior. **Prefer this over el.seq.**

The key difference: `el.seq2` continuously factors the offset into index calculation, so changing the offset property is immediately reflected.

```js
// Same usage as el.seq
el.seq2({seq: [440, 550, 660, 880]}, el.train(4), 0)

// With dynamic offset
el.seq2({seq: notes, offset: currentOffset}, el.train(bpm/60), resetTrigger)
```

**Props:** Same as `el.seq`

**Parameters:**

- `t`: Pulse train to advance steps
- `reset`: Pulse train to reset position

---

## el.sparseq(props, t, reset)

Sparse sequencer for time-based sequences. Better for large sequences or precise timing.

Values are specified as `{ value, tickTime }` where tickTime is measured in rising edges of the trigger signal.

```js
// Envelope-style sequence (value changes at specific times)
el.sparseq({
  seq: [
    { value: 1.0, tickTime: 0 },
    { value: 0.5, tickTime: 100 },
    { value: 0.0, tickTime: 200 }
  ]
}, el.train(500), gate) // 500Hz = 2ms per tick

// With interpolation
el.sparseq({
  seq: [
    { value: 0, tickTime: 0 },
    { value: 1, tickTime: 50 },
    { value: 0, tickTime: 100 }
  ],
  interpolate: 1
}, el.train(1000), 1)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seq | [] | Array | Array of `{value, tickTime}` objects |
| offset | 0 | Number | Starting position offset |
| loop | - | Number/false | Loop point in ticks, or false to disable |
| interpolate | 0 | Number | 1 for linear interpolation, 0 for hold |
| tickInterval | - | Number | Tick period in seconds (improves interpolation) |

**Parameters:**

- `t`: Pulse train (tick source)
- `reset`: Reset signal

---

## el.sparseq2(props, t)

Time-input sequencer. Takes time as an input signal rather than maintaining internal time.

```js
// Sample-time based (at 44.1kHz)
el.sparseq2({
  seq: [
    { time: 0, value: 0 },
    { time: 44100, value: 1 },  // 1 second
    { time: 88200, value: 0 }   // 2 seconds
  ]
}, el.time())

// Beat-based using PPQN
el.sparseq2({
  seq: [
    { time: 0, value: 440 },
    { time: 1, value: 550 },
    { time: 2, value: 660 }
  ],
  interpolate: 1
}, beatPosition) // beatPosition from DAW or manual calculation
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seq | [] | Array | Array of `{time, value}` objects |
| interpolate | 0 | Number | 1 for linear interpolation, 0 for hold |

**Parameters:**

- `t`: Time signal (units must match sequence)

---

## el.metro(props)

Metronome that emits events on each rising edge. Syncs with host transport.

**Availability:** Only in WASM-based renderers.

```js
core.render(el.metro({name: 'click', interval: 500})); // 500ms interval

core.on('metro', (e) => {
  console.log(e); // { source: 'click' }
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | '' | String | Event source identifier |
| interval | - | Number | Period in milliseconds |

**Difference from el.train:** Metro syncs with host transport and emits JavaScript events.

---

## el.counter(g)

Counts elapsed samples while gate is high. Resets to 0 when gate is low.

```js
// Count samples during note
el.counter(gateSignal)

// Use for time-based effects
let elapsed = el.counter(el.train(1)); // Samples since last trigger
```

**Parameters:**

- `g`: Gate signal (1 = counting, 0 = reset to 0)

---

## el.accum(xn, reset)

Running sum accumulator. Outputs continuous sum of input samples.

**Warning:** Values can grow very large very quickly.

```js
// Simple accumulator
el.accum(el.const({value: 0.001}), 0) // Ramp up

// With reset
el.accum(input, el.train(1)) // Reset every second
```

**Parameters:**

- `xn`: Signal to accumulate
- `reset`: Pulse train to reset sum to 0

---

## Sequencing Design Patterns

### Step Sequencer

```js
function stepSequencer(notes, bpm) {
  let trigger = el.train(bpm / 60);
  let freq = el.seq2({seq: notes, loop: true}, trigger, 0);
  return el.cycle(freq);
}
```

### Euclidean Rhythm Generator

```js
function euclidean(steps, pulses, rate) {
  // Pre-calculate euclidean pattern
  let pattern = generateEuclidean(steps, pulses); // [1,0,0,1,0,0,1,0]
  return el.seq2({seq: pattern}, el.train(rate), 0);
}
```

### Parameter Automation

```js
function automate(startVal, endVal, durationSecs) {
  return el.sparseq2({
    seq: [
      { time: 0, value: startVal },
      { time: durationSecs, value: endVal }
    ],
    interpolate: 1
  }, el.div(el.time(), el.sr()));
}
```
