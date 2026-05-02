# Rust/WASM Audio Engine Next Improvements

## Goal

Move the current Rust/WASM prototype from a working spike toward a maintainable browser DAW audio engine. Keep the scope focused on architecture and feature parity with the previous Elementary-based engine.

## 1. Split Rust engine into focused modules

The current Rust implementation is too concentrated in `lib.rs`. Split it into domain modules so future DSP and timeline work is easier to reason about.

Suggested shape:

```txt
packages/audio/rust/src
  lib.rs
  engine.rs
  transport.rs
  timeline.rs
  mixer.rs
  assets.rs
  meters.rs
  commands.rs
  dsp/
    mod.rs
    gain.rs
    pan.rs
    filter.rs
```

`lib.rs` should only expose the wasm-bindgen boundary. Core behavior should live in normal Rust types that are testable without WASM.

## 2. Precompile project state for rendering

The render callback should not repeatedly search/filter project state. When loading a project or applying an update, build render-ready structures.

Important changes:

- Store tracks in render order.
- Store clips grouped by track.
- Sort clips by timeline start.
- Keep derived gain/pan values where practical.
- Keep enough IDs/indexes to support targeted realtime updates.

The audio callback should iterate over already-prepared render structures, not derive them every block.

## 3. Improve transport ownership

Transport state should be fully owned by Rust. The AudioWorklet should not maintain an independent playhead except as a temporary event fallback.

Rust should own:

- play/pause/stop state,
- render position in samples,
- seek behavior,
- playhead event data,
- eventual loop region support.

The worklet should call Rust process and forward Rust-produced events to the controller.

## 4. Add realtime-safe parameter smoothing

Track gain, pan, and master gain currently update abruptly. Add smoothing inside Rust so UI changes do not click.

Smoothing should be part of DSP state, not React state. Parameter commands should update targets; the audio process should advance smoothed values per block or per sample.

Initial smoothing targets:

- track gain,
- track pan,
- master gain.

## 5. Implement current filter effect in Rust

Restore feature parity for the existing filter effect. Effects should be represented as internal Rust DSP nodes owned by tracks.

Initial effect support:

- enabled/bypassed state,
- ordered per-track chain,
- filter type,
- cutoff,
- resonance.

This should establish the basic internal plugin/effect architecture for future EQ/compressor/delay work.

## 6. Move metering into Rust

Metering should be calculated by the engine, not by TypeScript after rendering.

Rust should produce meter events for:

- master output,
- track post-fader output.

The worklet should periodically drain/forward meter snapshots to the controller. Meter timing should be controlled centrally and should avoid high-frequency `postMessage` spam.

## 7. Replace compatibility wrapper in the frontend

The current `AudioEngine` wrapper preserves the old Elementary-shaped API to keep the web app compiling. This should be temporary.

Move frontend integration toward:

```txt
Zero query result
  -> ProjectAudioState adapter
  -> AudioEngineController.loadProject/applyProjectUpdate
```

Remove old concepts from app code over time:

- `setTracks`,
- `setClips`,
- `setEffects`,
- `loadAudioIntoVFS`,
- VFS language.

The frontend should talk in project snapshots, asset sources, transport commands, and parameter updates.

## 8. Harden the worklet/WASM loading path

The prototype dynamic import path may be fragile across dev/build environments. Make the Vite/worklet/WASM loading behavior explicit and reliable.

Decide on a stable packaging approach for:

- generated `pkg/` files,
- wasm URL resolution,
- worklet module bundling,
- development vs production builds.

The outcome should be boring initialization: controller creates AudioContext, loads worklet, worklet initializes WASM, engine emits Ready/Error.

## 9. Add Rust tests for core rendering

Once core logic is outside `lib.rs`, add normal Rust unit tests for non-browser behavior.

Test areas:

- transport commands,
- clip timeline inclusion/exclusion,
- source offset handling,
- mute/solo behavior,
- gain/pan math,
- master gain,
- effect chain ordering.

Tests should target the Rust engine/domain modules, not the wasm-bindgen boundary.

## Success criteria

This improvement pass is successful when:

- Rust code is modular and testable.
- Render path no longer derives project structure every block.
- Existing DAW playback/mixer/filter behavior works through Rust/WASM.
- Frontend has a clear path away from the compatibility API.
- Worklet/WASM initialization is reliable in dev and production builds.
- Core audio behavior has Rust tests.
