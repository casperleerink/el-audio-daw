---
name: elementary-audio
description: |
  Audio DSP library for JavaScript/TypeScript using a functional, declarative approach. Use when working with Elementary Audio code including: (1) Writing audio synthesis and processing code using the el.* API, (2) Understanding existing Elementary Audio code, (3) Setting up web-renderer or offline-renderer, (4) Working with samples, filters, oscillators, envelopes, delays, dynamics, sequencing, (5) Debugging audio graph issues, keys, refs, or Virtual File System problems.
---

# Elementary Audio

Elementary is a JavaScript library for digital audio signal processing with a declarative, functional approach.

## Core Concepts

- **Declarative**: Describe what audio should sound like as a function of application state
- **Dynamic**: Built for changing audio requirements during user interactions
- **Portable**: Same code works across browsers, audio plugins, and embedded devices

## Quick Start

```js
import { el } from '@elemaudio/core';
import WebRenderer from '@elemaudio/web-renderer';

const core = new WebRenderer();
const ctx = new AudioContext();
await core.initialize(ctx, { numberOfInputs: 0, numberOfOutputs: 1 });
core.render(el.cycle(440)); // 440Hz sine wave
```

## Package Setup

### Web Renderer

```js
import WebRenderer from '@elemaudio/web-renderer';
const core = new WebRenderer();
await core.initialize(audioContext, options);
core.render(leftChannel, rightChannel);
```

### Offline Renderer

```js
import OfflineRenderer from '@elemaudio/offline-renderer';
const core = new OfflineRenderer();
await core.initialize({ sampleRate: 44100, blockSize: 512 });
core.render(outputNode);
```

## Key Patterns

### Keys for Efficient Updates

Use keys at leaf nodes to enable minimal graph updates:

```js
el.cycle(el.const({key: 'freq', value: 440}))
```

### Refs for Direct Property Updates

```js
const [node, setFreq] = core.createRef('const', {value: 440}, []);
core.render(el.cycle(node));
setFreq({value: 880}); // Update without re-render
```

### Virtual File System for Samples

```js
const buffer = await decodeAudioData(audioContext, arrayBuffer);
core.updateVirtualFileSystem({ '/sample.wav': buffer.getChannelData(0) });
el.sample({path: '/sample.wav'}, el.train(1), 1);
```

## Reference Documentation

For detailed API reference, read the appropriate reference file:

- **Oscillators & Generators**: See [references/oscillators.md](references/oscillators.md) for cycle, saw, square, triangle, blepsaw, blepsquare, bleptriangle, noise, pink, phasor, train
- **Filters**: See [references/filters.md](references/filters.md) for lowpass, highpass, bandpass, notch, allpass, biquad, svf, pole, dcblock, mm1p
- **Envelopes & Modulation**: See [references/envelopes.md](references/envelopes.md) for adsr, env, smooth, latch
- **Delays & Reverb**: See [references/delays.md](references/delays.md) for delay, sdelay, tapIn, tapOut, convolve
- **Dynamics**: See [references/dynamics.md](references/dynamics.md) for compress, skcompress
- **Sequencing**: See [references/sequencing.md](references/sequencing.md) for seq, seq2, sparseq, sparseq2, metro, counter, accum
- **Samples & Tables**: See [references/samples.md](references/samples.md) for sample, table, sampleseq, sampleseq2, mc.sample, mc.table
- **Analysis & Metering**: See [references/analysis.md](references/analysis.md) for meter, snapshot, scope, fft, capture, maxhold
- **Math Operations**: See [references/math.md](references/math.md) for sin, cos, add, mul, div, pow, and all math functions
- **Utilities**: See [references/utilities.md](references/utilities.md) for const, select, sr, sm, z, db2gain, tau2pole
- **Guides & Tutorials**: See [references/guides.md](references/guides.md) for conceptual guides and tutorials
