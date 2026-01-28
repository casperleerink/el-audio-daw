# Envelopes & Modulation

## Table of Contents

- [el.adsr](#eladsradsrg) - ADSR envelope
- [el.env](#elenvatkpolerelpolex) - Envelope follower
- [el.smooth](#elsmoothpx) - Signal smoothing
- [el.latch](#ellatchtx) - Sample and hold

---

## el.adsr(a, d, s, r, g)

Exponential ADSR envelope generator triggered by a gate signal.

- When gate is high (1): generates Attack → Decay → Sustain
- When gate is low (0): generates Release

```js
// Basic ADSR with 10ms attack, 100ms decay, 0.7 sustain, 200ms release
el.adsr(0.01, 0.1, 0.7, 0.2, gate)

// Polyphonic synth voice
el.mul(
  el.adsr(0.01, 0.1, 0.5, 0.3, el.const({key: `${voiceKey}:gate`, value: gate})),
  el.blepsaw(el.const({key: `${voiceKey}:freq`, value: freq}))
)
```

**Parameters:**

- `a`: Attack time in seconds
- `d`: Decay time in seconds
- `s`: Sustain level (0-1)
- `r`: Release time in seconds
- `g`: Gate signal (pulse train alternating 0/1)

---

## el.env(atkPole, relPole, x)

Envelope follower with separate attack and release times. Uses one-pole filter on absolute value of signal.

```js
// 10ms attack, 100ms release envelope follower
el.env(el.tau2pole(0.01), el.tau2pole(0.1), input)

// Sidechain compression envelope
let envelope = el.env(el.tau2pole(0.001), el.tau2pole(0.05), sidechain);
```

**Parameters:**

- `atkPole`: Attack pole (use `el.tau2pole` to convert time to pole)
- `relPole`: Release pole
- `x`: Input signal to follow

---

## el.smooth(p, x)

Unity gain one-pole smoothing filter. Use for smoothing discontinuities in control signals.

```js
el.smooth(el.tau2pole(0.02), control) // 20ms smoothing
el.smooth(0.999, parameterSignal)
```

**Parameters:**

- `p`: Pole position (use `el.tau2pole` for time-based)
- `x`: Signal to smooth

---

## el.latch(t, x)

Sample and hold. Samples a value from `x` on rising edge of pulse train `t`, then holds until next rising edge.

```js
// Sample noise every second
el.latch(el.train(1), el.noise())

// Random pitch changes
el.cycle(el.mul(1000, el.latch(el.train(4), el.rand())))
```

**Parameters:**

- `t`: Pulse train (trigger on rising edge)
- `x`: Signal to sample

---

## Envelope Design Patterns

### Attack/Release Envelope

Simple envelope using smoothing with different attack and release:

```js
function ar(attack, release, gate) {
  return el.select(
    gate,
    el.smooth(el.tau2pole(attack), gate),
    el.smooth(el.tau2pole(release), gate)
  );
}
```

### Custom ADSR with Hold

Using `el.sparseq` for sequenced envelope shapes:

```js
function adshr(a, h, d, s, r, gate) {
  let seq = el.sparseq(
    { seq: [
      { value: 1.0, tickTime: 0 },      // Attack target
      { value: s, tickTime: h * 500 },  // After hold, decay to sustain
    ]},
    el.train(500),
    gate
  );
  return el.smooth(el.tau2pole(a), seq);
}
```

### Time Constant Calculation

For exponential envelopes, the relationship between desired time and time constant:

```
timeConstant = desiredTimeInSeconds / 6.9
```
