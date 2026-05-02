import type { AudioAssetSource, DecodedAudioAsset } from "./protocol.js";

export async function decodeAudioAsset(
  audioContext: BaseAudioContext,
  asset: AudioAssetSource,
): Promise<DecodedAudioAsset> {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio asset ${asset.id}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    new Float32Array(audioBuffer.getChannelData(index)),
  );

  return {
    id: asset.id,
    sampleRate: audioBuffer.sampleRate,
    channels,
    lengthSamples: audioBuffer.length,
  };
}
