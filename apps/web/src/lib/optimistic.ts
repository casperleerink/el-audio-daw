import type { Id, TableNames } from "@el-audio-daw/backend/convex/_generated/dataModel";
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
