# Oscillators & Generators

## Table of Contents

- [el.cycle](#elcyclerate) - Sine wave oscillator
- [el.saw](#elsawrate) - Naive sawtooth (LFO only)
- [el.square](#elsquarerate) - Naive square (LFO only)
- [el.triangle](#eltrianglerate) - Naive triangle (LFO only)
- [el.blepsaw](#elblepsawrate) - Band-limited sawtooth
- [el.blepsquare](#elblepsquarerate) - Band-limited square
- [el.bleptriangle](#elbleptriangle) - Band-limited triangle
- [el.noise](#elnoiseprops) - White noise
- [el.pink](#elpinkx) - Pink noise filter
- [el.pinknoise](#elpinknoiseprops) - Pink noise generator
- [el.phasor](#elphasorrate) - Linear ramp 0-1
- [el.sphasor](#elsphasorratereset) - Resettable phasor
- [el.train](#eltrainrate) - Pulse train

---

## el.cycle(rate)

Outputs a periodic sine tone at the given frequency.

```js
el.cycle(440) // 440Hz sine wave
el.cycle(el.const({key: 'freq', value: 440})) // With key for updates
```

**Parameters:**

- `rate`: Frequency in Hz (number or signal)

---

## el.saw(rate)

Outputs a naive sawtooth oscillator. Due to aliasing at audio rates, use only for low frequency modulation.

```js
el.saw(1) // 1Hz LFO
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.square(rate)

Outputs a naive square oscillator. Due to aliasing, only use for low frequency modulation and control signals.

```js
el.square(2) // 2Hz square LFO
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.triangle(rate)

Outputs a naive triangle oscillator. Due to aliasing, only use for low frequency modulation and control signals.

```js
el.triangle(0.5) // 0.5Hz triangle LFO
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.blepsaw(rate)

Outputs a band-limited polyblep sawtooth waveform. Safe for audio-rate synthesis.

```js
el.blepsaw(440) // 440Hz band-limited sawtooth
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.blepsquare(rate)

Outputs a band-limited polyblep square waveform. Safe for audio-rate synthesis.

```js
el.blepsquare(440) // 440Hz band-limited square
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.bleptriangle(rate)

Outputs a band-limited polyblep triangle waveform. Safe for audio-rate synthesis.

```js
el.bleptriangle(440) // 440Hz band-limited triangle
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.noise([props])

Generates white noise - random numbers uniformly distributed on [-1, 1].

```js
el.noise() // Unseeded white noise
el.noise({seed: 12345}) // Seeded for reproducibility
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seed | undefined | Number | Seed for pseudo-random number generator |

---

## el.pink(x)

Applies a -3dB/octave lowpass filter to the incoming signal, creating pink noise characteristics.

```js
el.pink(el.noise()) // Pink noise from white noise
```

**Parameters:**

- `x`: Input signal to filter

---

## el.pinknoise([props])

Generates pink noise directly. Equivalent to `el.pink(el.noise(props))`.

```js
el.pinknoise() // Pink noise
el.pinknoise({seed: 42}) // Seeded pink noise
```

**Props:**
| Property | Default | Type | Description |
|----------|---------|------|-------------|
| seed | undefined | Number | Seed for pseudo-random number generator |

---

## el.phasor(rate)

Outputs a linear ramp from 0 to 1 at the given rate. Fundamental building block for oscillators.

```js
el.phasor(440) // 440Hz ramp
el.sin(el.mul(2 * Math.PI, el.phasor(440))) // Sine from phasor
```

**Parameters:**

- `rate`: Frequency in Hz

---

## el.sphasor(rate, reset)

Resettable phasor. Outputs a ramp from 0 to 1 that resets to 0 on each rising edge of the reset signal.

```js
el.sphasor(440, el.train(1)) // 440Hz phasor resetting every second
```

**Parameters:**

- `rate`: Frequency in Hz
- `reset`: Pulse train for resetting phase to 0

---

## el.train(rate)

Outputs a pulse train alternating between 0 and 1. Equivalent to `el.le(el.phasor(x), 0.5)`.

```js
el.train(1) // 1Hz pulse train (0.5s on, 0.5s off)
el.train(el.const({key: 'rate', value: 2})) // 2Hz with key
```

**Parameters:**

- `rate`: Frequency in Hz
