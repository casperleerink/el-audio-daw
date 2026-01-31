import type { Id, TableNames } from "@el-audio-daw/backend/convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

/**
 * Prefix used for temporary client-side IDs.
 * Entities with this prefix are considered "pending" until server confirms.
 */
const TEMP_ID_PREFIX = "temp_";

/**
 * Generate a temporary client ID for optimistic updates.
 * The ID is prefixed with "temp_" to distinguish from server-generated IDs.
 *
 * @example
 * const tempTrackId = tempId<"tracks">();
 * // Returns something like "temp_550e8400-e29b-41d4-a716-446655440000"
 */
export function tempId<TableName extends TableNames>(): Id<TableName> {
  return `${TEMP_ID_PREFIX}${crypto.randomUUID()}` as Id<TableName>;
}

/**
 * Type for entities that may be in a pending (optimistic) state.
 * The _pending flag indicates the entity hasn't been confirmed by the server.
 */
export type MaybePending<T> = T & { _pending?: boolean };

/**
 * Check if an entity is pending (has a temporary client-side ID).
 * Pending entities should have limited interactivity until server confirms.
 *
 * @example
 * if (isPending(track)) {
 *   // Disable drag, show loading indicator, etc.
 * }
 */
export function isPending(entity: { _id: string }): boolean {
  return entity._id.startsWith(TEMP_ID_PREFIX);
}

/**
 * Show a toast notification for a failed mutation rollback.
 * Used when an optimistic update fails and the UI reverts to server state.
 *
 * @param action - Description of the failed action (e.g., "create track", "update clip")
 */
export function showRollbackToast(action: string): void {
  toast.error(`Failed to ${action}. Changes reverted.`);
}

/**
 * Helper to get, transform, and set a query in one operation.
 * Handles the common pattern of getting current data, transforming it, and setting it back.
 *
 * @param localStore - The optimistic local store
 * @param query - The query function reference
 * @param queryArgs - Arguments for the query
 * @param transform - Function to transform the current data
 *
 * @example
 * updateOptimisticQuery(
 *   localStore,
 *   api.clips.getProjectClips,
 *   { projectId },
 *   (clips) => clips.filter(c => c._id !== clipId)
 * );
 */
export function updateOptimisticQuery<
  Query extends FunctionReference<"query">,
  Args extends Query["_args"],
>(
  localStore: OptimisticLocalStore,
  query: Query,
  queryArgs: Args,
  transform: (
    current: NonNullable<FunctionReturnType<Query>>,
  ) => NonNullable<FunctionReturnType<Query>>,
): void {
  const current = localStore.getQuery(query, queryArgs);
  if (current !== undefined) {
    localStore.setQuery(query, queryArgs, transform(current));
  }
}

/**
 * Helper for optimistic updates that require a projectId guard.
 * Returns early if projectId is not provided, otherwise executes the update.
 *
 * @param projectId - The project ID (may be undefined)
 * @param update - Function to execute if projectId is defined
 *
 * @example
 * withProjectIdGuard(args.projectId, (projectId) => {
 *   updateOptimisticQuery(localStore, api.clips.getProjectClips, { projectId }, transform);
 * });
 */
export function withProjectIdGuard<T extends Id<"projects">>(
  projectId: T | undefined,
  update: (projectId: T) => void,
): void {
  if (projectId) {
    update(projectId);
  }
}
