# Filters

## Table of Contents

- [el.lowpass](#ellowpassfcqx) - Lowpass filter
- [el.highpass](#elhighpassfcqx) - Highpass filter
- [el.bandpass](#elbandpassfcqx) - Bandpass filter
- [el.notch](#elnotchfcqx) - Notch filter
- [el.allpass](#elallpassfcqx) - Allpass filter
- [el.lowshelf](#ellowshelffcqgaindecibelsx) - Low shelf EQ
- [el.highshelf](#elhighshelffcqgaindecibelsx) - High shelf EQ
- [el.peak](#elpeakfcqgaindecibelsx) - Peaking/bell EQ
- [el.biquad](#elbiquadb0b1b2a1a2x) - Generic biquad filter
- [el.svf](#elsvfpropsfcqx) - State variable filter
- [el.svfshelf](#elsvfshelfpropsfcqgaindecibelsx) - State variable shelf
- [el.pole](#elpolepx) - One-pole filter
- [el.zero](#elzerob0b1x) - One-zero filter
- [el.dcblock](#eldcblockx) - DC blocking filter
- [el.mm1p](#elmm1ppropsgx) - Virtual analog multimode filter
- [el.df11](#eldf11b0b1a1x) - Direct Form 1 filter

---

## el.lowpass(fc, q, x)

Simple lowpass filter.

```js
el.lowpass(1000, 1, el.noise()) // 1kHz lowpass on noise
el.lowpass(el.const({key: 'cutoff', value: 800}), 0.707, input)
```

**Parameters:**

- `fc`: Cutoff frequency in Hz
- `q`: Q factor (resonance)
- `x`: Input signal

---

## el.highpass(fc, q, x)

Simple highpass filter.

```js
el.highpass(200, 1, input) // Remove frequencies below 200Hz
```

**Parameters:**

- `fc`: Cutoff frequency in Hz
- `q`: Q factor
- `x`: Input signal

---

## el.bandpass(fc, q, x)

Simple bandpass filter.

```js
el.bandpass(1000, 2, input) // Bandpass centered at 1kHz
```

**Parameters:**

- `fc`: Center frequency in Hz
- `q`: Q factor (bandwidth)
- `x`: Input signal

---

## el.notch(fc, q, x)

Notch (band-reject) filter.

```js
el.notch(60, 10, input) // Remove 60Hz hum
```

**Parameters:**

- `fc`: Notch frequency in Hz
- `q`: Q factor
- `x`: Input signal

---

## el.allpass(fc, q, x)

Allpass filter. Passes all frequencies but changes phase.

```js
el.allpass(1000, 1, input)
```

**Parameters:**

- `fc`: Cutoff frequency in Hz
- `q`: Q factor
- `x`: Input signal

---

## el.lowshelf(fc, q, gainDecibels, x)

Low shelf equalizer.

```js
el.lowshelf(200, 0.707, 6, input) // +6dB below 200Hz
el.lowshelf(100, 1, -3, input) // -3dB below 100Hz
```

**Parameters:**

- `fc`: Shelf frequency in Hz
- `q`: Q factor
- `gainDecibels`: Gain in dB
- `x`: Input signal

---

## el.highshelf(fc, q, gainDecibels, x)

High shelf equalizer.

```js
el.highshelf(8000, 0.707, 3, input) // +3dB above 8kHz
```

**Parameters:**

- `fc`: Shelf frequency in Hz
- `q`: Q factor
- `gainDecibels`: Gain in dB
- `x`: Input signal

---

## el.peak(fc, q, gainDecibels, x)

Peaking (bell) equalizer.

```js
el.peak(1000, 2, 6, input) // +6dB bell at 1kHz
el.peak(3000, 4, -4, input) // -4dB cut at 3kHz
```

**Parameters:**

- `fc`: Center frequency in Hz
- `q`: Q factor (bandwidth)
- `gainDecibels`: Gain in dB
- `x`: Input signal

---

## el.biquad(b0, b1, b2, a1, a2, x)

Generic second-order transposed direct-form II filter. Use when you need custom filter coefficients.

```js
el.biquad(b0, b1, b2, a1, a2, input)
```

**Parameters:**

- `b0, b1, b2`: Feedforward coefficients
- `a1, a2`: Feedback coefficients
- `x`: Input signal

---

## el.svf(props, fc, q, x)

Second-order state variable filter with selectable mode.

```js
el.svf({mode: 'lowpass'}, 1000, 1, input)
el.svf({mode: 'bandpass'}, 2000, 2, input)
```

**Props:**
| Property | Default | Type | Options |
|----------|---------|------|---------|
| mode | 'lowpass' | string | 'lowpass', 'bandpass', 'highpass', 'notch', 'allpass' |

**Parameters:**

- `fc`: Cutoff frequency in Hz
- `q`: Q factor
- `x`: Input signal

---

## el.svfshelf(props, fc, q, gainDecibels, x)

Second-order state variable shelf filter.

```js
el.svfshelf({mode: 'lowshelf'}, 200, 0.707, 6, input)
el.svfshelf({mode: 'highshelf'}, 8000, 1, 3, input)
el.svfshelf({mode: 'peak'}, 1000, 2, -3, input)
```

**Props:**
| Property | Default | Type | Options |
|----------|---------|------|---------|
| mode | 'lowshelf' | string | 'lowshelf', 'highshelf', 'peak', 'bell' |

---

## el.pole(p, x)

One-pole filter (leaky integrator). `y[n] = x[n] + p * y[n-1]`

```js
el.pole(0.99, input) // Smoothing filter
el.pole(el.tau2pole(0.1), input) // 100ms decay
```

**Parameters:**

- `p`: Pole position
- `x`: Input signal

---

## el.zero(b0, b1, x)

One-zero filter. `y[n] = b0 * x[n] + b1 * x[n-1]`

```js
el.zero(0.5, 0.5, input) // Simple averaging
```

**Parameters:**

- `b0`: Coefficient for current sample
- `b1`: Coefficient for previous sample
- `x`: Input signal

---

## el.dcblock(x)

DC blocking filter with pole at 0.995 and zero at 1. -3dB cutoff near 35Hz at 44.1kHz.

```js
el.dcblock(input) // Remove DC offset
```

**Parameters:**

- `x`: Input signal

---

## el.mm1p(props, g, x)

First-order virtual analog zero-delay multimode filter based on Zavalishin's "The Art of VA Filter Design".

```js
el.mm1p({mode: 'lowpass'}, el.prewarp(800), input)
el.mm1p({mode: 'highpass'}, el.prewarp(200), input)
```

**Props:**
| Property | Default | Type | Options |
|----------|---------|------|---------|
| mode | 'lowpass' | string | 'lowpass', 'highpass', 'allpass' |

**Parameters:**

- `g`: Analog-domain cutoff (use with `el.prewarp`)
- `x`: Input signal

---

## el.df11(b0, b1, a1, x)

First-order pole-zero filter using Direct Form 1.

```js
el.df11(b0, b1, a1, input)
```

**Parameters:**

- `b0, b1`: Feedforward coefficients
- `a1`: Feedback coefficient
- `x`: Input signal
