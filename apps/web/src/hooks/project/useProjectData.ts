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

  // Single query loads project with all related data (tracks, clips, samples, effects)
  const [project] = useQuery(queries.projects.byId({ id: projectId ?? "" }));

  // Extract related data from project (already synced via .related() in the query)
  const tracks = useMemo(() => project?.tracks ?? [], [project]);
  const clips = useMemo(() => project?.clips ?? [], [project]);
  const samples = useMemo(() => project?.samples ?? [], [project]);

  // Build waveformUrls keyed by sampleId
  const waveformUrls = useMemo(() => {
    const urls: Record<string, string | null> = {};
    for (const sample of samples) {
      urls[sample.id] = sample.waveformUrl ?? null;
    }
    return urls;
  }, [samples]);

  // Create sample lookup map for duration and metadata access
  const samplesMap = useMemo(() => new Map(samples.map((af) => [af.id, af])), [samples]);

  // Loading and not-found states
  const isLoading = projectId !== null && project === undefined;
  const notFound = projectId !== null && project === null;

  return {
    project,
    tracks,
    clips,
    samples,
    waveformUrls,
    samplesMap,
    isLoading,
    notFound,
  };
}
