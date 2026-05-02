import type { EngineCommand, EngineEvent } from "@el-audio-daw/audio";

const statusElement = document.querySelector<HTMLPreElement>("#status");
const runButton = document.querySelector<HTMLButtonElement>("#run");

function setStatus(message: string): void {
  if (statusElement) statusElement.textContent = message;
}

function post(node: AudioWorkletNode, command: EngineCommand, transfer: Transferable[] = []): void {
  node.port.postMessage(command, transfer);
}

async function runSmokeTest(): Promise<void> {
  setStatus("initializing");

  const context = new AudioContext({ sampleRate: 48_000 });
  await context.audioWorklet.addModule(
    new URL("../../../packages/audio/src/worklet/processor.generated.js", import.meta.url),
  );

  const node = new AudioWorkletNode(context, "daw-audio-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.connect(context.destination);

  const events: EngineEvent[] = [];
  node.port.onmessage = (event: MessageEvent<EngineEvent>) => {
    events.push(event.data);
    if (event.data.type === "Error") {
      setStatus(`FAIL ${event.data.message}`);
    }
  };

  await waitForEvent(events, "Ready", 5_000);

  const samples = new Float32Array(48_000);
  samples.fill(0.25);

  post(node, { type: "Initialize", sampleRate: context.sampleRate, emitPlayheadIntervalMs: 25 });
  post(node, {
    type: "LoadProject",
    project: {
      projectId: "smoke-project",
      sampleRate: 48_000,
      tracks: [{ id: "track-1", kind: "audio", order: 0, muted: false, solo: false, gainDb: 0, pan: 0 }],
      clips: [
        {
          id: "clip-1",
          trackId: "track-1",
          assetId: "asset-1",
          startSamples: 0,
          durationSamples: samples.length,
          sourceStartSamples: 0,
          gainDb: 0,
        },
      ],
      effects: [],
      master: { gainDb: 0 },
    },
  });
  post(
    node,
    {
      type: "LoadAsset",
      asset: {
        id: "asset-1",
        sampleRate: 48_000,
        channels: [samples],
        lengthSamples: samples.length,
      },
    },
    [samples.buffer],
  );

  await context.resume();
  post(node, { type: "Play" });

  const meterEvent = await waitForEvent(events, "Meters", 5_000);
  const masterMeter = meterEvent.meters.find((meter) => meter.id === "master");
  if (!masterMeter || masterMeter.peak <= 0 || masterMeter.rms <= 0) {
    throw new Error(`Expected non-zero master meter, got ${JSON.stringify(meterEvent)}`);
  }

  post(node, { type: "Stop" });
  node.disconnect();
  node.port.close();
  await context.close();

  setStatus(`PASS peak=${masterMeter.peak.toFixed(4)} rms=${masterMeter.rms.toFixed(4)}`);
}

async function waitForEvent<T extends EngineEvent["type"]>(
  events: EngineEvent[],
  type: T,
  timeoutMs: number,
): Promise<Extract<EngineEvent, { type: T }>> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const found = events.find((event): event is Extract<EngineEvent, { type: T }> => event.type === type);
    if (found) return found;
    const error = events.find((event) => event.type === "Error");
    if (error?.type === "Error") throw new Error(error.message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

runButton?.addEventListener("click", () => {
  runSmokeTest().catch((error: unknown) => {
    setStatus(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  });
});
