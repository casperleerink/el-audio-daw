import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { AudioFile } from "@el-audio-daw/zero/schema";

type CreateAudioFileArgs = {
  projectId: string;
  storageUrl: string;
  waveformUrl?: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
};

/**
 * Hook for managing audio files using Zero sync.
 * Provides audio file queries and mutations with real-time sync.
 * Zero handles optimistic updates automatically.
 */
export function useZeroAudioFiles(projectId: string | undefined) {
  const zero = useZero();
  const [audioFiles] = useQuery(
    projectId ? queries.audioFiles.byProject({ projectId }) : undefined,
  );

  const createAudioFile = useCallback(
    async (args: CreateAudioFileArgs) => {
      const id = crypto.randomUUID();
      await zero.mutate(
        mutators.audioFiles.create({
          id,
          projectId: args.projectId,
          storageUrl: args.storageUrl,
          waveformUrl: args.waveformUrl,
          name: args.name,
          duration: args.duration,
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
      await zero.mutate(mutators.audioFiles.updateWaveform({ id, waveformUrl }));
    },
    [zero],
  );

  const deleteAudioFile = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.audioFiles.delete({ id }));
    },
    [zero],
  );

  return {
    audioFiles: (audioFiles ?? []) as AudioFile[],
    createAudioFile,
    updateWaveform,
    deleteAudioFile,
  };
}
