import type { Doc, Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@el-audio-daw/backend/convex/_generated/api";

type Project = Doc<"projects">;

type UpdateProjectArgs = {
  id: Id<"projects">;
  name: string;
};

/**
 * Optimistic update for updateProject mutation.
 * Instantly applies name change to the local cache.
 */
export function updateProjectOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: UpdateProjectArgs,
): void {
  const current = localStore.getQuery(api.projects.getProject, { id: args.id });

  if (current !== undefined && current !== null) {
    const updated: Project = {
      ...current,
      name: args.name,
      updatedAt: Date.now(),
    };

    localStore.setQuery(api.projects.getProject, { id: args.id }, updated);
  }
}
