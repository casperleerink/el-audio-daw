/**
 * Registry to track pending file uploads per track.
 * Enables cancellation of uploads when a track is deleted.
 *
 * Per FR-7 of the optimistic updates PRD:
 * - Track pending uploads per track
 * - Cancel uploads when track is deleted
 * - Use AbortController for fetch cancellation
 */

interface PendingUpload {
  abortController: AbortController;
  fileName: string;
}

// Map of trackId -> array of pending uploads for that track
const pendingUploads = new Map<string, PendingUpload[]>();

/**
 * Register a new upload for a track. Returns the AbortController's signal
 * to be used with fetch.
 */
export function registerUpload(trackId: string, fileName: string): AbortController {
  const abortController = new AbortController();

  const uploads = pendingUploads.get(trackId) ?? [];
  uploads.push({ abortController, fileName });
  pendingUploads.set(trackId, uploads);

  return abortController;
}

/**
 * Unregister an upload after it completes (success or failure).
 * Should be called in a finally block after the upload.
 */
export function unregisterUpload(trackId: string, abortController: AbortController): void {
  const uploads = pendingUploads.get(trackId);
  if (!uploads) return;

  const filtered = uploads.filter((u) => u.abortController !== abortController);

  if (filtered.length === 0) {
    pendingUploads.delete(trackId);
  } else {
    pendingUploads.set(trackId, filtered);
  }
}

/**
 * Cancel all pending uploads for a track.
 * Call this before or during track deletion to abort in-flight uploads.
 * Returns the number of uploads that were cancelled.
 */
export function cancelUploadsForTrack(trackId: string): number {
  const uploads = pendingUploads.get(trackId);
  if (!uploads || uploads.length === 0) return 0;

  const count = uploads.length;

  for (const upload of uploads) {
    upload.abortController.abort();
  }

  pendingUploads.delete(trackId);

  return count;
}

/**
 * Check if a track has any pending uploads.
 */
export function hasPendingUploads(trackId: string): boolean {
  const uploads = pendingUploads.get(trackId);
  return uploads !== undefined && uploads.length > 0;
}

/**
 * Get the count of pending uploads for a track.
 */
export function getPendingUploadCount(trackId: string): number {
  const uploads = pendingUploads.get(trackId);
  return uploads?.length ?? 0;
}
