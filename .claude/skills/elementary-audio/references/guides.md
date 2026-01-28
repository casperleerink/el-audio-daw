# Guides & Tutorials

## Table of Contents

- [Core Concepts](#core-concepts)
- [Understanding Keys](#understanding-keys)
- [Using Refs](#using-refs)
- [Virtual File System](#virtual-file-system)
- [Sample-Accurate Rendering](#sample-accurate-rendering)
- [Web MIDI Integration](#web-midi-integration)
- [Distortion & Saturation](#distortion--saturation)
- [Envelope Design](#envelope-design)
- [Native Integrations](#native-integrations)

---

## Core Concepts

Elementary uses a **functional, declarative** approach:

- Describe what you want to hear, not how to transition between states
- Elementary handles threading, memory, and signal continuity
- Application lifecycle: receive input → update state → describe audio → render → repeat

### The Audio Graph

Audio nodes compose into complex structures using the `el` namespace:

- Each node outputs a single-channel signal
- Nodes accept multiple children as inputs
- Multi-channel output requires separate graphs per channel

```js
// Stereo output
core.render(
  el.mul(0.5, el.cycle(440)),  // Left
  el.mul(0.5, el.cycle(441))   // Right
);
```

### The Renderer

The renderer translates graph descriptions into actual audio:

- `core.render()` applies your desired audio configuration
- **Reconciliation**: Elementary compares new graph vs. active graph and applies only necessary changes
- Can handle thousands of interconnected nodes within milliseconds

```js
// Dynamic updates - just call render again
core.render(el.cycle(440));
// Later...
core.render(el.cycle(880)); // Elementary efficiently updates
```

---

## Understanding Keys

Keys enable efficient graph updates by identifying nodes across renders.

### The Problem

Without keys, Elementary treats mathematically different functions as completely different nodes:

```js
el.cycle(440)  // Different from
el.cycle(441)  // This, even though conceptually similar
```

Re-rendering causes unnecessary graph replacement with fade-overs.

### The Solution

Assign keys to identify persistent nodes:

```js
// With key, Elementary recognizes this is the same node with changed frequency
el.cycle(el.const({key: 'mainOsc', value: 440}))

// Later update just the value
el.cycle(el.const({key: 'mainOsc', value: 880}))
```

### Best Practices

- Keys are most valuable at **leaf nodes** (nodes without children)
- Use unique identifiers, especially for polyphonic voices:

```js
voices.map(v =>
  el.mul(
    el.adsr(0.01, 0.1, 0.5, 0.3, el.const({key: `${v.id}:gate`, value: v.gate})),
    el.blepsaw(el.const({key: `${v.id}:freq`, value: v.freq}))
  )
)
```

---

## Using Refs

Refs enable direct property updates without graph reconciliation.

### When to Use Refs

If you know in advance that you'll frequently update a specific property, refs avoid rebuilding the entire graph.

### Creating and Using Refs

```js
// 1. Create ref
const [freqNode, setFreq] = core.createRef('const', {value: 440}, []);

// 2. Use in graph
core.render(el.cycle(freqNode));

// 3. Update directly (no re-render needed)
slider.oninput = (e) => {
  setFreq({value: parseFloat(e.target.value)});
};
```

### Ref Flexibility

Works with any node type and property:

```js
// Filter cutoff ref
const [cutoffNode, setCutoff] = core.createRef('const', {value: 1000}, []);
core.render(el.lowpass(cutoffNode, 1, input));

// Update cutoff instantly
setCutoff({value: newCutoff});
```

**Note:** Instantaneous changes (like switching filter modes) may produce audio artifacts.

---

## Virtual File System

The VFS coordinates access to shared resources like samples and lookup tables.

### Loading Data

```js
// Web Renderer
const response = await fetch('/sample.wav');
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

core.updateVirtualFileSystem({
  '/samples/kick.wav': audioBuffer.getChannelData(0)
});
```

### Using Loaded Data

```js
// Reference by path
el.sample({path: '/samples/kick.wav'}, el.train(1), 1)
el.table({path: '/wavetables/saw.wav'}, el.phasor(440))
```

### Multi-channel Samples

```js
// Load stereo (or name channels explicitly)
core.updateVirtualFileSystem({
  '/samples/stereo.wav:0': buffer.getChannelData(0),
  '/samples/stereo.wav:1': buffer.getChannelData(1)
});

// Use with mc.sample
let [L, R] = el.mc.sample({path: '/samples/stereo.wav', channels: 2}, trigger, 1);
```

### Management

```js
// List loaded resources
core.listVirtualFileSystem();

// Remove unused resources
core.pruneVirtualFileSystem();
```

---

## Sample-Accurate Rendering

Elementary has two processing contexts:

1. **Main JavaScript thread**: Where you write code
2. **Realtime audio thread**: Processes buffered audio blocks

### JavaScript-rate Updates

Changes apply at the start of the next audio block (~every 10-20ms):

```js
// Update every 12ms from JavaScript
setInterval(() => {
  let lfoValue = computeLFO();
  core.render(el.lowpass(lfoValue, 1, input));
}, 12);
```

**Pros:** Lower CPU on audio thread
**Cons:** Not sample-accurate

### Audio-rate Processing

Define modulation in the graph itself:

```js
// LFO computed at audio rate
let lfoFreq = el.add(500, el.mul(400, el.cycle(2)));
core.render(el.lowpass(lfoFreq, 1, input));
```

**Pros:** Sample-accurate modulation
**Cons:** More CPU on audio thread

### Choosing an Approach

- Use JavaScript-rate for infrequent updates (button presses, UI changes)
- Use audio-rate for continuous modulation (LFOs, envelopes, FM)

---

## Web MIDI Integration

### Setup with webmidi.js

```js
import WebMidi from 'webmidi';

await WebMidi.enable();

WebMidi.inputs.forEach(input => {
  input.addListener('noteon', e => {
    playNote(e.note.number, e.velocity);
  });

  input.addListener('noteoff', e => {
    releaseNote(e.note.number);
  });
});
```

### MIDI to Frequency

```js
function midiToFreq(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}
```

### Polyphonic Voice Management

```js
const MAX_VOICES = 8;
let voices = [];

function playNote(note, velocity) {
  voices.push({ note, velocity, gate: 1 });
  if (voices.length > MAX_VOICES) voices.shift();
  updateAudio();
}

function releaseNote(note) {
  const voice = voices.find(v => v.note === note);
  if (voice) voice.gate = 0;
  updateAudio();
}

function updateAudio() {
  core.render(
    el.add(...voices.map(v =>
      el.mul(
        el.adsr(0.01, 0.1, 0.5, 0.2, el.const({key: `${v.note}:g`, value: v.gate})),
        el.blepsaw(el.const({key: `${v.note}:f`, value: midiToFreq(v.note)}))
      )
    ))
  );
}
```

---

## Distortion & Saturation

### Basic Tanh Saturation

```js
function saturate(input, drive) {
  return el.tanh(el.mul(drive, input));
}

// Usage
el.tanh(el.mul(4, input))  // 4x drive
```

### Pre/Post Filtering

```js
function warmSaturation(input, drive) {
  // Cut highs before saturation
  let filtered = el.lowpass(4000, 0.707, input);
  let saturated = el.tanh(el.mul(drive, filtered));
  // Gentle high-shelf after
  return el.highshelf(8000, 0.707, -2, saturated);
}
```

### Lookup Table Waveshaper

```js
// Create transfer function
const tableSize = 1024;
const transferFunction = new Float32Array(tableSize);
for (let i = 0; i < tableSize; i++) {
  const x = (i / tableSize) * 2 - 1;  // -1 to 1
  transferFunction[i] = Math.tanh(x * 3);  // Custom curve
}

core.updateVirtualFileSystem({ '/waveshaper': transferFunction });

// Use as waveshaper (input must be scaled to 0-1 for table lookup)
function waveshape(input) {
  let phase = el.mul(0.5, el.add(1, input));  // [-1,1] → [0,1]
  return el.table({path: '/waveshaper'}, phase);
}
```

**Warning:** Waveshaping can introduce aliasing. Consider oversampling for quality.

---

## Envelope Design

### Functional Attack/Release

```js
function ar(attack, release, gate) {
  // Different smoothing for attack vs release
  let atkPole = el.tau2pole(attack / 6.9);
  let relPole = el.tau2pole(release / 6.9);

  return el.select(
    gate,
    el.smooth(atkPole, gate),  // Attack: smooth towards 1
    el.smooth(relPole, gate)   // Release: smooth towards 0
  );
}
```

### ADSR with Hold Using sparseq

```js
function adshr(attack, hold, decay, sustain, release, gate) {
  let tickRate = 500;  // 2ms per tick

  // Sequence: immediate 1.0, then decay to sustain after hold
  let seq = el.sparseq({
    seq: [
      { value: 1.0, tickTime: 0 },
      { value: sustain, tickTime: hold * tickRate }
    ],
    interpolate: 0
  }, el.train(tickRate), gate);

  // Smooth the sequence
  let timeConstant = attack / 6.9;
  return el.smooth(el.tau2pole(timeConstant), seq);
}
```

### Randomized Polyphonic Envelopes

```js
function randomizedVoice(freq, gate, voiceKey) {
  let randAttack = 0.001 + Math.random() * 0.05;
  let randDecay = 0.05 + Math.random() * 0.2;
  let randSustain = 0.3 + Math.random() * 0.5;

  let env = el.adsr(randAttack, randDecay, randSustain, 0.1,
    el.const({key: `${voiceKey}:gate`, value: gate})
  );

  return el.mul(env, el.blepsaw(el.const({key: `${voiceKey}:freq`, value: freq})));
}
```

---

## Native Integrations

Elementary can be embedded into C++ projects without JavaScript processing.

### CMake Setup

```cmake
add_subdirectory(elementary/runtime)
target_link_libraries(YourProject PRIVATE elementary)
```

### C++ Runtime API

```cpp
#include <elem/Runtime.h>

// Initialize
elem::Runtime<float> runtime(sampleRate, blockSize);

// Apply graph instructions (from JSON)
runtime.applyInstructions(jsonInstructions);

// Process audio
runtime.process(
    inputData,   // const float**
    numInputChannels,
    outputData,  // float**
    numOutputChannels,
    numSamples,
    nullptr      // userData
);

// Handle events
runtime.processQueuedEvents([](std::string_view type, elem::js::Value data) {
    // Handle meter, snapshot, etc. events
});
```

### Custom Native Nodes

```cpp
class MyGainNode : public elem::GraphNode<float> {
public:
    void setProperty(std::string_view key, elem::js::Value val) override {
        if (key == "gain") {
            gain = static_cast<float>(val);
        }
    }

    void process(elem::BlockContext<float>& ctx) override {
        for (size_t i = 0; i < ctx.numSamples; ++i) {
            ctx.outputData[0][i] = ctx.inputData[0][i] * gain;
        }
    }

private:
    float gain = 1.0f;
};

// Register
runtime.registerNodeType("myGain", [](auto id, double sr, int bs) {
    return std::make_shared<MyGainNode>(id, sr, bs);
});
```

### JavaScript Wrapper

```js
import { createNode } from '@elemaudio/core';

const myGain = (props, x) => createNode('myGain', props, [x]);

// Usage
myGain({gain: 0.5}, input)
```
