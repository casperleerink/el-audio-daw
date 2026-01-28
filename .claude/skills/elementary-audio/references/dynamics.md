# Dynamics Processing

## Table of Contents

- [el.compress](#elcompressatkmrelmthresholdratiosidechainxn) - Hard-knee compressor
- [el.skcompress](#elskcompressatkmrelmthresholdratiokneewidthsidechainxn) - Soft-knee compressor

---

## el.compress(atkMs, relMs, threshold, ratio, sidechain, xn)

Hard-knee dynamic range compressor with sidechain input.

```js
// Basic compression
el.compress(10, 100, -24, 4, input, input)

// Drum bus compression
let drums = el.add(kick, el.add(snare, el.add(hat, cymbals)));
el.compress(5, 50, -18, 6, drums, drums)

// Sidechain compression (ducking)
el.compress(1, 100, -30, 10, kickDrum, synthPad)
```

**Parameters:**

- `atkMs`: Attack time in milliseconds
- `relMs`: Release time in milliseconds
- `threshold`: Threshold in decibels (compression starts above this)
- `ratio`: Compression ratio (e.g., 4 means 4:1)
- `sidechain`: Signal used for level detection
- `xn`: Signal to compress

**Notes:**

- Uses hard-knee compression curve
- For standard compression, pass same signal to both sidechain and xn
- For sidechain/ducking effects, use different signals

---

## el.skcompress(atkMs, relMs, threshold, ratio, kneeWidth, sidechain, xn)

Soft-knee dynamic range compressor. Identical to `el.compress` when kneeWidth is 0.

```js
// Soft-knee compression for smoother response
el.skcompress(10, 100, -24, 4, 6, input, input)

// Gentle bus compression with wide knee
el.skcompress(30, 200, -18, 2, 12, mix, mix)

// Aggressive limiting with narrow knee
el.skcompress(0.1, 50, -6, 20, 1, input, input)
```

**Parameters:**

- `atkMs`: Attack time in milliseconds
- `relMs`: Release time in milliseconds
- `threshold`: Threshold in decibels
- `ratio`: Compression ratio
- `kneeWidth`: Knee width in decibels (0 = hard knee)
- `sidechain`: Signal used for level detection
- `xn`: Signal to compress

---

## Dynamics Design Patterns

### Parallel Compression (New York Compression)

```js
function parallelCompress(input, blend) {
  let compressed = el.compress(5, 100, -30, 8, input, input);
  return el.add(
    el.mul(1 - blend, input),
    el.mul(blend, compressed)
  );
}
```

### Multiband Compression

```js
function multibandCompress(input) {
  let low = el.lowpass(200, 0.707, input);
  let mid = el.bandpass(1000, 1, input);
  let high = el.highpass(4000, 0.707, input);

  let lowComp = el.compress(20, 150, -18, 3, low, low);
  let midComp = el.compress(10, 100, -15, 4, mid, mid);
  let highComp = el.compress(5, 80, -12, 2, high, high);

  return el.add(lowComp, el.add(midComp, highComp));
}
```

### Limiter

```js
function limiter(input, ceiling) {
  return el.skcompress(0.1, 50, ceiling, 100, 0.5, input, input);
}
```

### Expander/Gate

```js
function gate(input, threshold, ratio) {
  // Use envelope follower + conditional gain
  let env = el.env(el.tau2pole(0.001), el.tau2pole(0.05), input);
  let envDb = el.mul(20, el.log10(el.add(env, 0.0001)));
  let gain = el.select(
    el.gt(envDb, threshold),
    1,
    el.db2gain(el.mul(ratio, el.sub(envDb, threshold)))
  );
  return el.mul(input, el.smooth(el.tau2pole(0.01), gain));
}
```
