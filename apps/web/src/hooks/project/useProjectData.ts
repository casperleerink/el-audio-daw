import { useMemo } from "react";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { useProjectId } from "@/stores/projectStore";

/**
 * Hook for accessing project data from Zero.
 * Derives and memoizes related data structures needed throughout the project editor.
 */
export function useProjectData() {
  const projectId = useProjectId();

  // Single query loads project with all related data (tracks, clips, audioFiles, effects)
  const [project] = useQuery(queries.projects.byId({ id: projectId ?? "" }));

  // Extract related data from project (already synced via .related() in the query)
  const tracks = useMemo(() => project?.tracks ?? [], [project]);
  const clips = useMemo(() => project?.clips ?? [], [project]);
  const audioFiles = useMemo(() => project?.audioFiles ?? [], [project]);

  // Build clipUrls from audioFiles (they have storageUrl)
  const clipUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const clip of clips) {
      const audioFile = clip.audioFile;
      if (audioFile?.storageUrl) {
        urls[clip.id] = audioFile.storageUrl;
      }
    }
    return urls;
  }, [clips]);

  // Build waveformUrls keyed by audioFileId
  const waveformUrls = useMemo(() => {
    const urls: Record<string, string | null> = {};
    for (const audioFile of audioFiles) {
      urls[audioFile.id] = audioFile.waveformUrl ?? null;
    }
    return urls;
  }, [audioFiles]);

  // Create audioFile lookup map for duration and metadata access
  const audioFilesMap = useMemo(() => new Map(audioFiles.map((af) => [af.id, af])), [audioFiles]);

  // Loading and not-found states
  const isLoading = projectId !== null && project === undefined;
  const notFound = projectId !== null && project === null;

  return {
    project,
    tracks,
    clips,
    audioFiles,
    clipUrls,
    waveformUrls,
    audioFilesMap,
    isLoading,
    notFound,
  };
}
