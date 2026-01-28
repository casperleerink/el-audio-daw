# Delays & Reverb

## Table of Contents

- [el.delay](#eldelaypropsdeleyfeedbackx) - Variable delay line
- [el.sdelay](#elsdelaypropsx) - Static delay line
- [el.tapIn](#eltapinprops) - Feedback tap input
- [el.tapOut](#eltapoutpropsx) - Feedback tap output
- [el.convolve](#elconvolvepropsx) - Convolution reverb

---

## el.delay(props, delay, feedback, x)

Variable-length delay line with feedback.

```js
// Simple 500ms delay
el.delay({size: 44100}, el.ms2samps(500), 0, input)

// Delay with 50% feedback (echo effect)
el.delay({size: 44100}, el.ms2samps(250), 0.5, input)

// Comb filter (short delay with feedback)
el.delay({size: 1024}, 100, 0.9, input)

// Allpass with feedforward
let delayed = el.delay({size: 1024}, 100, 0.7, input);
el.add(el.mul(-0.7, input), delayed) // Feedforward creates allpass
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| size | 0 | Number | Maximum delay line length in samples |

**Parameters:**

- `delay`: Delay time in samples (use `el.ms2samps` for ms)
- `feedback`: Feedback coefficient (-1 to 1)
- `x`: Input signal

---

## el.sdelay(props, x)

Static delay line with fixed length. More efficient than `el.delay` when delay time doesn't change.

```js
// Fixed 1 second delay
el.sdelay({size: 44100}, input)

// Fixed 10ms delay
el.sdelay({size: 441}, input)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| size | 0 | Number | Delay length in samples |

**Parameters:**

- `x`: Input signal

---

## el.tapIn(props)

Retrieves a signal from a named `tapOut` node, enabling feedback loops around arbitrary subgraphs.

**Warning:** Feedback loops can grow in volume extremely quickly. Always include gain reduction.

```js
// Create feedback loop
let feedback = el.tapIn({name: 'fb'});
let wet = el.delay({size: 44100}, el.ms2samps(300), 0, el.add(input, el.mul(0.5, feedback)));
el.tapOut({name: 'fb'}, wet)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | '' | String | Name of the tapOut to retrieve from |

---

## el.tapOut(props, x)

Creates a named tap point for feedback loops. Works with `el.tapIn`.

**Important:** `tapOut` implements an implicit block-size delay before the signal propagates. This is required for digital feedback.

```js
// Simple feedback network
let fb = el.tapIn({name: 'loop'});
let processed = el.lowpass(2000, 1, el.add(input, el.mul(0.6, fb)));
el.tapOut({name: 'loop'}, processed)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | '' | String | Name identifier for this tap point |

**Parameters:**

- `x`: Signal to tap

---

## el.convolve(props, x)

Convolution processor using an impulse response from the Virtual File System.

**Availability:** Only available in WASM-based renderers (web-renderer, offline-renderer).

```js
// Load impulse response first
core.updateVirtualFileSystem({
  '/ir/hall.wav': hallImpulseBuffer
});

// Apply convolution reverb
el.convolve({path: '/ir/hall.wav'}, input)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| path | '' | String | Path to impulse response in VFS |

**Parameters:**

- `x`: Input signal

---

## Delay Design Patterns

### Ping-Pong Delay

```js
function pingPong(input, delayMs, feedback) {
  let delayL = el.delay({size: 88200}, el.ms2samps(delayMs), feedback, input);
  let delayR = el.delay({size: 88200}, el.ms2samps(delayMs * 2), feedback, input);
  return [delayL, delayR];
}
```

### Modulated Delay (Chorus)

```js
function chorus(input, rate, depth) {
  let mod = el.mul(depth, el.add(1, el.cycle(rate)));
  let baseDelay = el.ms2samps(20);
  return el.delay({size: 4410}, el.add(baseDelay, mod), 0, input);
}
```

### Allpass Reverb Building Block

```js
function allpass(input, delayMs, gain) {
  let delaySamps = el.ms2samps(delayMs);
  let delayed = el.delay({size: 4410}, delaySamps, gain, input);
  return el.add(el.mul(-gain, input), delayed);
}
```
