# Samples & Tables

## Table of Contents

- [el.sample](#elsamplepropstrate) - Sample playback
- [el.table](#eltablepropst) - Wavetable lookup
- [el.sampleseq](#elsampleseqpropst) - Time-based sample sequencing
- [el.sampleseq2](#elsampleseq2propst) - Sample sequencing with pitch/stretch
- [el.mc.sample](#elmcsamplepropst) - Multi-channel sample
- [el.mc.table](#elmctablepropst) - Multi-channel table
- [el.mc.sampleseq](#elmcsampleseqpropst) - Multi-channel sample sequencing
- [el.mc.sampleseq2](#elmcsampleseq2propst) - Multi-channel with pitch/stretch

---

## el.sample(props, t, rate)

Loads and plays a sample from the Virtual File System.

```js
// Basic playback on trigger
el.sample({path: '/drums/kick.wav'}, el.train(1), 1)

// Half speed playback
el.sample({path: '/samples/vocal.wav'}, trigger, 0.5)

// Dynamic pitch
el.sample({path: '/samples/note.wav'}, gate, el.const({key: 'pitch', value: 1}))

// Looping sample
el.sample({path: '/samples/loop.wav', mode: 'loop'}, 1, 1)
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| path | '' | String | Path in Virtual File System |
| mode | 'trigger' | String | 'trigger', 'gate', or 'loop' |
| startOffset | 0 | Number | Playback start position in samples |
| stopOffset | 0 | Number | Stop position from end in samples |

**Parameters:**

- `t`: Pulse train or gate signal
- `rate`: Playback rate (1 = normal, 0.5 = half speed, 2 = double speed)

**Modes:**

- `trigger`: Plays full sample on each rising edge
- `gate`: Plays while gate is high, stops when low
- `loop`: Loops continuously while gate is high

---

## el.table(props, t)

Lookup table driven by phase signal. Ideal for wavetable synthesis.

```js
// Wavetable oscillator
el.table({path: '/wavetables/saw.wav'}, el.phasor(440))

// Partial table sweep (use 25% of table)
el.table({path: '/tables/wave.wav'}, el.mul(0.25, el.phasor(220)))
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| path | '' | String | Path to buffer in VFS |

**Parameters:**

- `t`: Phase signal (0-1 sweeps entire table)

---

## el.sampleseq(props, t)

Schedules sample playback over time. Handles timeline scrubbing correctly.

Use when you need samples triggered at specific times that may jump around (e.g., user scrubbing a timeline).

```js
el.sampleseq({
  seq: [
    { time: 0.0, value: 1 },   // Trigger at 0s
    { time: 0.5, value: 0 },   // Stop at 0.5s
    { time: 1.0, value: 1 },   // Trigger at 1s
    { time: 1.5, value: 0 }    // Stop at 1.5s
  ],
  path: '/samples/hit.wav',
  duration: 0.25  // Sample is 0.25s long
}, el.div(el.time(), el.sr()))  // Time in seconds
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seq | [] | Array | `{time, value}` pairs (1 = trigger, 0 = stop) |
| path | '' | String | Path in VFS |
| duration | 0 | Number | Sample duration (same units as time input) |

**Parameters:**

- `t`: Time signal (units must match seq and duration)

---

## el.sampleseq2(props, t)

Sample sequencing with pitch shifting and time stretching.

```js
el.sampleseq2({
  seq: [
    { time: 0, value: 1 },
    { time: 2, value: 0 }
  ],
  path: '/vocals/phrase.wav',
  duration: 4,
  shift: 7,      // +7 semitones
  stretch: 2     // 2x slower
}, el.div(el.time(), el.sr()))
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seq | [] | Array | `{time, value}` pairs |
| path | '' | String | Path in VFS |
| duration | 0 | Number | Original sample duration |
| shift | 0 | Number | Pitch shift in semitones |
| stretch | 1 | Number | Time stretch factor (0.25-4) |

---

## el.mc.sample(props, t)

Multi-channel sample playback. Returns array of channel signals.

```js
// Stereo sample playback
let [left, right] = el.mc.sample({
  path: '/samples/stereo.wav',
  channels: 2
}, el.train(1), 1);

// Use in render
core.render(left, right);
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| path | '' | String | Path in VFS |
| mode | 'trigger' | String | 'trigger', 'gate', or 'loop' |
| startOffset | 0 | Number | Start position in samples |
| stopOffset | 0 | Number | Stop position from end |
| playbackRate | 1 | Number | Playback speed |
| channels | - | Number | **Required.** Number of output channels |

---

## el.mc.table(props, t)

Multi-channel wavetable lookup.

```js
let [left, right] = el.mc.table({
  path: '/wavetables/stereo.wav',
  channels: 2
}, el.phasor(220));
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| path | '' | String | Path in VFS |
| channels | - | Number | **Required.** Number of output channels |

---

## el.mc.sampleseq(props, t)

Multi-channel sample sequencing.

```js
let [left, right] = el.mc.sampleseq({
  channels: 2,
  seq: [
    { time: 0, value: 1 },
    { time: 1, value: 0 }
  ],
  path: '/samples/stereo.wav',
  duration: 2
}, el.div(el.time(), el.sr()));
```

**Props:** Same as `el.sampleseq` plus `channels` (required).

---

## el.mc.sampleseq2(props, t)

Multi-channel sample sequencing with pitch/stretch.

```js
let [left, right] = el.mc.sampleseq2({
  channels: 2,
  seq: [{ time: 0, value: 1 }],
  path: '/vocals/stereo.wav',
  duration: 4,
  shift: -5,     // -5 semitones
  stretch: 1.5   // 1.5x slower
}, el.div(el.time(), el.sr()));
```

**Props:** Same as `el.sampleseq2` plus `channels` (required).

---

## Virtual File System Setup

### Web Renderer

```js
// Decode audio file to buffer
const response = await fetch('/path/to/sample.wav');
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

// Add to VFS
core.updateVirtualFileSystem({
  '/sample.wav': audioBuffer.getChannelData(0)
});

// For stereo
core.updateVirtualFileSystem({
  '/stereo.wav:0': audioBuffer.getChannelData(0),
  '/stereo.wav:1': audioBuffer.getChannelData(1)
});
```

### During Initialization

```js
await core.initialize(audioContext, {
  processorOptions: {
    virtualFileSystem: {
      '/kick.wav': kickBuffer,
      '/snare.wav': snareBuffer
    }
  }
});
```
