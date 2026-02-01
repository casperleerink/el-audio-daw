/**
 * Storage utilities for fetching presigned download URLs from R2 storage keys.
 */

import { env } from "@el-audio-daw/env/web";

// Cache presigned URLs to avoid redundant requests
// URLs expire but are valid for long enough for typical usage
const urlCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

/**
 * Get a presigned download URL for a storage key.
 * Caches URLs to avoid redundant requests.
 *
 * @param projectId - The project ID (for access validation)
 * @param storageKey - The R2 storage key (e.g., "projects/{id}/audio/{file}")
 * @returns Presigned download URL
 */
export async function getDownloadUrl(projectId: string, storageKey: string): Promise<string> {
  // Check cache first
  const cached = urlCache.get(storageKey);
  if (cached) return cached;

  // Check for pending request
  const pending = pendingRequests.get(storageKey);
  if (pending) return pending;

  // Start new request
  const requestPromise = (async () => {
    try {
      const response = await fetch(`${env.VITE_BETTER_AUTH_URL}/api/storage/download-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, key: storageKey }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get download URL: ${response.status}`);
      }

      const data = (await response.json()) as { downloadUrl: string };
      const downloadUrl = data.downloadUrl;

      // Cache the URL
      urlCache.set(storageKey, downloadUrl);

      return downloadUrl;
    } finally {
      pendingRequests.delete(storageKey);
    }
  })();

  pendingRequests.set(storageKey, requestPromise);
  return requestPromise;
}

/**
 * Clear the URL cache (e.g., when switching projects).
 */
export function clearUrlCache(): void {
  urlCache.clear();
}
