import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { Sample } from "@el-audio-daw/zero/schema";

type CreateSampleArgs = {
  projectId: string;
  storageUrl: string;
  waveformUrl?: string;
  name: string;
  durationSampleFrames: number;
  sampleRate: number;
  channels: number;
};

/**
 * Hook for managing Samples using Zero sync.
 * Provides Sample queries and mutations with real-time sync.
 * Zero handles optimistic updates automatically.
 */
export function useZeroSamples(projectId: string | undefined) {
  const zero = useZero();
  const [samples] = useQuery(projectId ? queries.samples.byProject({ projectId }) : undefined);

  const createSample = useCallback(
    async (args: CreateSampleArgs) => {
      const id = crypto.randomUUID();
      await zero.mutate(
        mutators.samples.create({
          id,
          projectId: args.projectId,
          storageUrl: args.storageUrl,
          waveformUrl: args.waveformUrl,
          name: args.name,
          durationSampleFrames: args.durationSampleFrames,
          sampleRate: args.sampleRate,
          channels: args.channels,
        }),
      );
      return id;
    },
    [zero],
  );

  const updateWaveform = useCallback(
    async (id: string, waveformUrl: string) => {
      await zero.mutate(mutators.samples.updateWaveform({ id, waveformUrl }));
    },
    [zero],
  );

  const deleteSample = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.samples.delete({ id }));
    },
    [zero],
  );

  return {
    samples: (samples ?? []) as Sample[],
    createSample,
    updateWaveform,
    deleteSample,
  };
}
