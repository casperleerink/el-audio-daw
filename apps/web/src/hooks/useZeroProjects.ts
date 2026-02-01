import { useCallback } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { Project } from "@el-audio-daw/zero/schema";

/**
 * Hook for managing projects using Zero sync.
 * Provides project queries and mutations with real-time sync.
 */
export function useZeroProjects() {
  const zero = useZero();
  const [projectUsersWithProjects] = useQuery(queries.projects.mine());

  // Extract projects from the related project data
  const projects: Project[] = (projectUsersWithProjects ?? [])
    .map((pu) => pu.project)
    .filter((project): project is Project => project !== null);

  const createProject = useCallback(
    async (name: string) => {
      const id = crypto.randomUUID();
      const projectUserId = crypto.randomUUID();
      await zero.mutate(mutators.projects.create({ id, projectUserId, name }));
      return id;
    },
    [zero],
  );

  const updateProject = useCallback(
    async (id: string, name: string) => {
      await zero.mutate(mutators.projects.update({ id, name }));
    },
    [zero],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.projects.delete({ id }));
    },
    [zero],
  );

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
  };
}
