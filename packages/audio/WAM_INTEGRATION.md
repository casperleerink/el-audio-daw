# Web Audio Modules (WAM) Integration

This document summarizes research on integrating WAM plugins with Elementary Audio.

## Background

Elementary Audio does not natively support VST3 or other plugin formats. However, **Web Audio Modules (WAM) 2.0** is an open standard for browser-based audio plugins that can be integrated alongside Elementary.

### What is WAM?

- Open source framework for web audio plugins (instruments, effects, MIDI processors)
- Uses WebAssembly for near-native performance
- Supports porting existing plugins from JUCE and iPlug 2 frameworks
- FAUST DSP files can compile directly to WAM format

### Resources

- [WebAudioPlugins SDK](https://github.com/micbuffa/WebAudioPlugins)
- [WAM 2.0 Paper (ACM)](https://dl.acm.org/doi/abs/10.1145/3487553.3524225)
- [Made with WebAssembly - WAM Showcase](https://madewithwebassembly.com/showcase/web-audio-modules/)

## Integration Architecture

Elementary's `WebRenderer` creates an `AudioWorkletNode`. WAM plugins are also `AudioWorkletNode` instances. This allows chaining them via the Web Audio API.

### Pattern 1: Post-Processing Chain

The simplest approach - WAM plugins process the final output from Elementary.

```
Elementary Renderer → WAM Plugin(s) → Audio Destination
```

This requires no changes to the Elementary graph structure.

### Pattern 2: Per-Track Plugin Inserts

Use separate Elementary renderers per track, with WAM plugins inserted in each track's chain.

```
Track 1: Elementary → WAM Effects → ┐
Track 2: Elementary → WAM Effects → ┼→ Master Bus → Destination
Track 3: Elementary → WAM Effects → ┘
```

Requires multiple `WebRenderer` instances instead of a single unified graph.

### Pattern 3: Interleaved Effects Chain

Elementary supports audio inputs via `el.in()`. This enables inserting WAM plugins between Elementary processing stages.

```
Elementary Pre-FX → WAM Plugin → Elementary Post-FX → Destination
  (renderer 1)                      (renderer 2)
  numberOfInputs: 0                 numberOfInputs: 1
                                    uses el.in() for input
```

The second renderer receives audio from the WAM plugin through its audio input, then processes it with Elementary nodes.

This pattern allows flexible effect ordering:

- Elementary EQ → WAM Compressor → Elementary Delay → WAM Reverb

Consecutive Elementary effects should be grouped into single renderers to minimize complexity.

## Latency Considerations

| Source                    | Latency                                  |
| ------------------------- | ---------------------------------------- |
| Web Audio render quantum  | 128 samples (~2.9ms at 44.1kHz)          |
| Chained AudioWorkletNodes | No additional latency (same callback)    |
| WAM plugin internal       | Depends on plugin (lookahead, FFT, etc.) |

Chaining multiple AudioWorkletNodes (Elementary renderers and WAM plugins) does not add cumulative buffer delays. All nodes in the Web Audio graph process within the same render quantum.

## Trade-offs

| Approach                         | Pros                | Cons                                            |
| -------------------------------- | ------------------- | ----------------------------------------------- |
| Single renderer, post-FX WAMs    | Simple architecture | No mid-chain inserts                            |
| Multi-renderer with interleaving | Full flexibility    | Complex state management, multiple render calls |

## Limitations

- WAM plugins must be compiled to WebAssembly; native VST3s cannot be loaded directly
- No hardware-accelerated plugin GUIs in browser
- File I/O restrictions apply to plugins running in browser context
