export type WavData = {
  sampleRate: number;
  channels: number;
  durationSampleFrames: number;
  buffer: Buffer;
};

export function encodeWav(samples: Float32Array, sampleRate: number, channels = 1): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(clamped * 0x7fff), offset);
    offset += 2;
  }

  return buffer;
}

export function decodeWavHeader(buffer: Buffer): {
  sampleRate: number;
  channels: number;
  durationSampleFrames: number;
} {
  if (buffer.toString("utf8", 0, 4) !== "RIFF" || buffer.toString("utf8", 8, 12) !== "WAVE") {
    throw new Error("Not a valid WAV file");
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  let dataOffset = 12;
  while (dataOffset < buffer.length - 8) {
    const chunkId = buffer.toString("utf8", dataOffset, dataOffset + 4);
    const chunkSize = buffer.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      const durationSampleFrames = chunkSize / (channels * (bitsPerSample / 8));
      return { sampleRate, channels, durationSampleFrames };
    }
    dataOffset += 8 + chunkSize;
  }
  throw new Error("WAV data chunk not found");
}
