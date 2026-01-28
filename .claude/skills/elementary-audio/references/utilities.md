# Utilities

## Table of Contents

- [el.const](#elconstprops) - Constant value
- [el.select](#elselectgab) - Conditional select
- [el.sr](#elsr) - Sample rate
- [el.sm](#elsmx) - Quick smoothing
- [el.z](#elzx) - Single sample delay
- [el.db2gain](#eldb2gaindb) - dB to linear gain
- [el.tau2pole](#eltau2polet) - Time to pole coefficient
- [el.ms2samps](#elms2sampsx) - Milliseconds to samples
- [el.prewarp](#elprewarpwd) - Cutoff prewarping
- [el.time](#eltime) - Sample counter
- [el.hann](#elhannt) - Hann window
- [el.rand](#elrandprops) - Random 0-1

---

## el.const(props)

Constant value node. Numeric literals are shorthand for const nodes.

```js
el.const({value: 440})
el.const({key: 'freq', value: 440})  // With key for updates

// These are equivalent:
el.cycle(440)
el.cycle(el.const({value: 440}))
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| value | 0 | Number | The constant value |

---

## el.select(g, a, b)

Conditional selection based on gate signal. Returns `a` when gate is high, `b` when low. Interpolates for values between 0 and 1.

```js
// Hard switch
el.select(gate, signalA, signalB)

// Use with train for rapid switching
el.select(el.train(10), oscA, oscB)

// Smooth crossfade
el.select(el.sm(gate), signalA, signalB)
```

**Parameters:**

- `g`: Gate signal [0, 1]
- `a`: Signal when gate is high
- `b`: Signal when gate is low

---

## el.sr()

Returns the current sample rate as a constant.

```js
el.sr()  // 44100, 48000, etc.

// Time in seconds
el.div(el.time(), el.sr())

// Nyquist frequency
el.div(el.sr(), 2)
```

---

## el.sm(x)

Quick smoothing filter with 20ms decay time. Equivalent to `el.smooth(el.tau2pole(0.02), x)`.

```js
el.sm(control)  // Smooth parameter changes

// Smooth crossfade
el.select(el.sm(gate), a, b)
```

**Parameters:**

- `x`: Signal to smooth

---

## el.z(x)

Single sample delay (z^-1). Delays input by exactly one sample.

```js
el.z(input)  // x[n-1]

// Simple differentiator
el.sub(input, el.z(input))

// Allpass filter building block
```

**Parameters:**

- `x`: Input signal

---

## el.db2gain(db)

Converts decibels to linear gain. Equivalent to `10^(db/20)`.

```js
el.db2gain(-6)     // 0.5 (approximately)
el.db2gain(0)      // 1.0
el.db2gain(6)      // ~2.0

// Apply dB gain to signal
el.mul(el.db2gain(-12), input)

// Dynamics with dB calculations
el.mul(el.db2gain(makeupGain), compressed)
```

**Parameters:**

- `db`: Value in decibels

---

## el.tau2pole(t)

Computes pole position for exponential decay over time `t` (60dB decay).

```js
el.tau2pole(0.1)    // Pole for 100ms decay

// Use with filters
el.pole(el.tau2pole(0.05), input)
el.smooth(el.tau2pole(0.02), control)
el.env(el.tau2pole(0.01), el.tau2pole(0.1), input)
```

**Parameters:**

- `t`: Time to decay 60dB in seconds

---

## el.ms2samps(x)

Converts milliseconds to samples based on current sample rate.

```js
el.ms2samps(100)    // 4410 at 44.1kHz
el.ms2samps(500)    // 22050 at 44.1kHz

// Delay in milliseconds
el.delay({size: 44100}, el.ms2samps(250), feedback, input)
```

**Parameters:**

- `x`: Time in milliseconds

---

## el.prewarp(wd)

Cutoff frequency prewarping for virtual analog filters. Converts digital-domain frequency to analog-domain equivalent.

```js
// Use with el.mm1p
el.mm1p({mode: 'lowpass'}, el.prewarp(800), input)
el.mm1p({mode: 'highpass'}, el.prewarp(200), input)
```

**Parameters:**

- `wd`: Digital-domain cutoff frequency in Hz

---

## el.time()

Returns continuously incrementing sample count. Starts at 0.

**Availability:** Only in WASM-based renderers.

```js
el.time()  // 0, 1, 2, 3, ...

// Time in seconds
el.div(el.time(), el.sr())

// Use with sparseq2
el.sparseq2({seq: [...]}, el.div(el.time(), el.sr()))
```

---

## el.hann(t)

Generates a Hann window based on input phase (0-1).

```js
// Hann window at 1Hz
el.hann(el.phasor(1))

// Apply window to audio block
el.mul(input, el.hann(el.phasor(44100/512)))
```

**Parameters:**

- `t`: Phase signal (0 = left edge, 1 = right edge of window)

---

## el.rand([props])

Generates random numbers uniformly distributed on [0, 1].

```js
el.rand()            // Unseeded random
el.rand({seed: 42})  // Seeded for reproducibility

// Random frequency modulation
el.cycle(el.add(400, el.mul(100, el.rand())))
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seed | undefined | Number | Seed for PRNG |

---

## Common Utility Patterns

### Parameter Smoothing

```js
function smoothParam(value, key) {
  return el.sm(el.const({key, value}));
}
```

### Safe Division

```js
function safeDivide(a, b, epsilon = 0.0001) {
  return el.div(a, el.add(b, epsilon));
}
```

### Time-based LFO

```js
function lfo(rate) {
  return el.sin(el.mul(2 * Math.PI, el.div(el.time(), el.mul(el.sr(), rate))));
}
```

### Smooth Step

```js
function smoothstep(edge0, edge1, x) {
  let t = el.max(0, el.min(1, el.div(el.sub(x, edge0), el.sub(edge1, edge0))));
  return el.mul(el.mul(t, t), el.sub(3, el.mul(2, t)));
}
```
