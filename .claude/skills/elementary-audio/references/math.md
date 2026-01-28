# Math Operations

All math operations work on signals and can accept either numbers or signal nodes as arguments.

## Table of Contents

- [Arithmetic](#arithmetic)
- [Trigonometry](#trigonometry)
- [Comparison](#comparison)
- [Logic](#logic)
- [Exponential & Logarithmic](#exponential--logarithmic)
- [Rounding](#rounding)
- [Utility](#utility)

---

## Arithmetic

### el.add(...args)

Left fold addition over inputs.

```js
el.add(a, b)           // a + b
el.add(a, b, c, d)     // a + b + c + d
```

### el.sub(a, b)

Subtraction.

```js
el.sub(a, b)           // a - b
```

### el.mul(...args)

Left fold multiplication over inputs.

```js
el.mul(a, b)           // a * b
el.mul(a, b, c)        // a * b * c
el.mul(0.5, input)     // Gain of 0.5
```

### el.div(a, b)

Division.

```js
el.div(a, b)           // a / b
el.div(el.time(), el.sr())  // Time in seconds
```

### el.mod(a, b)

Modulo operation.

```js
el.mod(a, b)           // a % b
```

### el.pow(base, exp)

Exponentiation.

```js
el.pow(2, 3)           // 2^3 = 8
el.pow(input, 2)       // Square the input
```

---

## Trigonometry

### el.sin(x)

Sine of input (radians).

```js
el.sin(el.mul(2 * Math.PI, el.phasor(440)))  // Sine oscillator
```

### el.cos(x)

Cosine of input (radians).

```js
el.cos(phase)
```

### el.tan(x)

Tangent of input (radians).

```js
el.tan(phase)
```

### el.tanh(x)

Hyperbolic tangent. Commonly used for soft clipping/saturation.

```js
el.tanh(el.mul(gain, input))  // Soft saturation
```

---

## Comparison

### el.eq(a, b)

Equality comparison. Returns 1 if equal, 0 otherwise.

```js
el.eq(a, b)            // 1 if a == b
```

### el.le(a, b)

Less than or equal.

```js
el.le(a, b)            // 1 if a <= b
```

### el.leq(a, b)

Less than or equal (alias).

```js
el.leq(a, b)           // 1 if a <= b
```

### el.ge(a, b)

Greater than or equal.

```js
el.ge(a, b)            // 1 if a >= b
```

### el.geq(a, b)

Greater than or equal (alias).

```js
el.geq(a, b)           // 1 if a >= b
```

### el.lt(a, b)

Less than.

```js
el.lt(a, b)            // 1 if a < b
```

### el.gt(a, b)

Greater than.

```js
el.gt(a, b)            // 1 if a > b
```

### el.min(...args)

Minimum value.

```js
el.min(a, b)           // min(a, b)
el.min(a, b, c)        // min(a, b, c)
```

### el.max(...args)

Maximum value.

```js
el.max(a, b)           // max(a, b)
el.max(input, 0)       // Half-wave rectification
```

---

## Logic

### el.and(a, b)

Logical AND.

```js
el.and(gate1, gate2)   // 1 if both are non-zero
```

### el.or(a, b)

Logical OR.

```js
el.or(gate1, gate2)    // 1 if either is non-zero
```

---

## Exponential & Logarithmic

### el.exp(x)

Natural exponential (e^x).

```js
el.exp(x)
```

### el.ln(x)

Natural logarithm.

```js
el.ln(x)
```

### el.log(x)

Base-10 logarithm.

```js
el.log(x)
```

### el.log2(x)

Base-2 logarithm.

```js
el.log2(x)
```

### el.log10(x)

Base-10 logarithm (alias).

```js
el.log10(x)
```

### el.sqrt(x)

Square root.

```js
el.sqrt(x)
```

---

## Rounding

### el.ceil(x)

Ceiling (round up).

```js
el.ceil(x)
```

### el.floor(x)

Floor (round down).

```js
el.floor(x)
```

### el.round(x)

Round to nearest integer.

```js
el.round(x)
```

### el.abs(x)

Absolute value.

```js
el.abs(x)              // |x|
el.abs(input)          // Full-wave rectification
```

---

## Utility

### el.in(props)

Input selector. Selects audio input channel or child node.

```js
el.in({channel: 0})    // First audio input channel
el.in({channel: 1})    // Second audio input channel
```

### el.identity(x)

Pass through input unchanged.

```js
el.identity(x)         // x
```

---

## Common Patterns

### Gain in Decibels

```js
el.mul(el.db2gain(-6), input)  // -6dB gain
```

### Clipping/Limiting

```js
el.max(-1, el.min(1, input))   // Hard clip to [-1, 1]
el.tanh(el.mul(2, input))       // Soft clip
```

### Linear Interpolation

```js
function lerp(a, b, t) {
  return el.add(el.mul(el.sub(1, t), a), el.mul(t, b));
}
```

### Frequency to MIDI Note

```js
function freqToMidi(freq) {
  return el.add(69, el.mul(12, el.log2(el.div(freq, 440))));
}
```

### MIDI Note to Frequency

```js
function midiToFreq(midi) {
  return el.mul(440, el.pow(2, el.div(el.sub(midi, 69), 12)));
}
```

### Bipolar to Unipolar

```js
el.mul(0.5, el.add(1, bipolarSignal))  // [-1,1] → [0,1]
```

### Unipolar to Bipolar

```js
el.sub(el.mul(2, unipolarSignal), 1)   // [0,1] → [-1,1]
```
