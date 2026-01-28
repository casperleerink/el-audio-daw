# Analysis & Metering

## Table of Contents

- [el.meter](#elmeterprops) - Peak metering
- [el.snapshot](#elsnapshotpropstx) - Value capture events
- [el.scope](#elscopeprops) - Waveform capture
- [el.fft](#elfftpropsx) - FFT analysis
- [el.capture](#elcapturepropsgx) - Audio recording
- [el.mc.capture](#elmccapturepropsg) - Multi-channel capture
- [el.maxhold](#elmaxholdpropsx) - Peak hold

---

## el.meter(props, x)

Pass-through node that measures peak values each block and emits events.

```js
// Add metering to output
let output = el.meter({name: 'main'}, processedSignal);
core.render(output);

// Listen for meter events
core.on('meter', (e) => {
  if (e.source === 'main') {
    updateMeter(e.min, e.max);
  }
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |

**Event Object:**

```js
{ source: 'main', min: -0.5, max: 0.8 }
```

---

## el.snapshot(props, t, x)

Captures the current value of a signal on rising edge of pulse train and emits as event.

The signal passes through unchanged - snapshot only emits events.

```js
// Capture parameter value 10 times per second
let sig = el.snapshot({name: 'freq'}, el.train(10), frequencySignal);

core.on('snapshot', (e) => {
  console.log(`${e.source}: ${e.data}`);
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |

**Parameters:**

- `t`: Pulse train (trigger on rising edge)
- `x`: Signal to sample

**Event Object:**

```js
{ source: 'freq', data: 440.5 }
```

---

## el.scope(props, ...children)

Buffers incoming signals and reports them through events. Use for waveform visualization.

```js
// Single channel scope
core.render(el.scope({name: 'waveform', size: 1024}, output));

core.on('scope', (e) => {
  if (e.source === 'waveform') {
    drawWaveform(e.data[0]); // Array of samples
  }
});

// Multi-channel synchronized scope
core.render(
  el.scope({name: 'stereo', size: 512, channels: 2}, left, right)
);

core.on('scope', (e) => {
  // e.data[0] = left channel, e.data[1] = right channel
  // Guaranteed to be from same time window
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |
| size | 512 | Number | Buffer block size |
| channels | 1 | Number | Number of child signals |

**Event Object:**

```js
{ source: 'stereo', data: [Float32Array, Float32Array] }
```

---

## el.fft(props, x)

Real-to-complex FFT analysis. Emits frequency domain data as events.

**Availability:** Only in WASM-based renderers.

```js
core.render(el.fft({name: 'spectrum', size: 2048}, input));

core.on('fft', (e) => {
  if (e.source === 'spectrum') {
    // e.data.real and e.data.imag are arrays
    drawSpectrum(e.data.real, e.data.imag);
  }
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |
| size | 1024 | Number | FFT block size |

**Event Object:**

```js
{ source: 'spectrum', data: { real: Float32Array, imag: Float32Array } }
```

---

## el.capture(props, g, x)

Records input signal while gate is high. Emits captured buffer when gate goes low.

```js
// Capture 1 second of audio
core.render(el.capture({name: 'rec'}, el.train(1), input));

core.on('capture', (e) => {
  // e.data is Float32Array of captured samples
  processRecording(e.data);
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |

**Parameters:**

- `g`: Gate signal (1 = recording, 0 = stop and emit)
- `x`: Signal to record

**Event Object:**

```js
{ source: 'rec', data: Float32Array }
```

---

## el.mc.capture(props, g, ...xs)

Multi-channel capture. Records multiple synchronized signals.

```js
// Capture stereo audio
core.render(
  el.mc.capture({name: 'stereo', channels: 2}, gate, left, right)
);

core.on('capture', (e) => {
  // e.data is array of Float32Arrays
  let leftBuffer = e.data[0];
  let rightBuffer = e.data[1];
});
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| name | undefined | String | Event source identifier |
| channels | - | Number | Number of input channels |

---

## el.maxhold(props, x, reset)

Tracks and outputs the maximum value seen from input signal. Optionally resets on pulse or after hold time.

```js
// Simple peak hold
el.maxhold({}, input, 0)

// With 200ms hold time
el.maxhold({hold: 200}, input, 0)

// With reset trigger
el.maxhold({}, input, el.train(2)) // Reset every 0.5s
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| hold | 0 | Number | Maximum hold time in milliseconds |

**Parameters:**

- `x`: Input signal
- `reset`: Pulse train to reset max value

---

## Analysis Design Patterns

### VU Meter

```js
function vuMeter(input, name) {
  // RMS-based metering with smoothing
  let squared = el.mul(input, input);
  let avg = el.smooth(el.tau2pole(0.3), squared);
  let rms = el.sqrt(avg);
  return el.meter({name}, rms);
}
```

### Spectrum Analyzer with Windowing

```js
function spectrumAnalyzer(input, name) {
  // Apply Hann window before FFT
  let windowed = el.mul(input, el.hann(el.phasor(44100/2048)));
  return el.fft({name, size: 2048}, windowed);
}
```

### Level Triggered Recording

```js
function levelTriggeredCapture(input, threshold, name) {
  let env = el.env(el.tau2pole(0.001), el.tau2pole(0.1), input);
  let gate = el.gt(env, threshold);
  return el.capture({name}, gate, input);
}
```
