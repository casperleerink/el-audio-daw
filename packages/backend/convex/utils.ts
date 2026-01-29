import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Check if a user has access to a project by verifying they are a projectUser.
 * Returns true if the user has access, false otherwise.
 */
export async function checkProjectAccess(
  db: DatabaseReader | DatabaseWriter,
  projectId: Id<"projects">,
  userId: string,
): Promise<boolean> {
  const projectUser = await db
    .query("projectUsers")
    .withIndex("by_project_and_user", (q) => q.eq("projectId", projectId).eq("userId", userId))
    .first();
  return projectUser !== null;
}

/**
 * Handle clip overlap when a new clip is placed or an existing clip is moved.
 * - Deletes existing clips that are completely covered by the new clip region
 * - Truncates existing clips that overlap at their end (new clip starts inside them)
 *
 * @param db - Database writer for modifying clips
 * @param trackId - The track containing the clips
 * @param newStartTime - Start time of the new/moved clip
 * @param newClipEnd - End time of the new/moved clip (startTime + duration)
 * @param excludeClipId - Optional clip ID to exclude (when moving an existing clip)
 */
export async function handleClipOverlap(
  db: DatabaseWriter,
  trackId: Id<"tracks">,
  newStartTime: number,
  newClipEnd: number,
  excludeClipId?: Id<"clips">,
): Promise<void> {
  const existingClips = await db
    .query("clips")
    .withIndex("by_track", (q) => q.eq("trackId", trackId))
    .collect();

  for (const clip of existingClips) {
    if (excludeClipId && clip._id === excludeClipId) continue;

    const clipEnd = clip.startTime + clip.duration;

    // Check if new clip completely covers existing clip
    if (newStartTime <= clip.startTime && newClipEnd >= clipEnd) {
      await db.delete(clip._id);
      continue;
    }

    // Check if new clip starts inside existing clip
    if (newStartTime > clip.startTime && newStartTime < clipEnd) {
      // Truncate existing clip's duration to end where new clip starts
      await db.patch(clip._id, {
        duration: newStartTime - clip.startTime,
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * Extend project duration if a clip extends beyond the current duration.
 * Adds 10 seconds of padding beyond the clip end.
 *
 * @param db - Database writer for modifying the project
 * @param projectId - The project to check/extend
 * @param clipEndTime - The end time of the clip (startTime + duration)
 */
export async function extendProjectDurationIfNeeded(
  db: DatabaseWriter,
  projectId: Id<"projects">,
  clipEndTime: number,
): Promise<void> {
  const project = await db.get(projectId);
  if (!project) return;

  const projectSampleRate = project.sampleRate ?? 44100;
  const currentDuration = project.duration ?? 10 * projectSampleRate;

  if (clipEndTime > currentDuration) {
    const extendedDuration = clipEndTime + 10 * projectSampleRate;
    await db.patch(projectId, {
      duration: extendedDuration,
      updatedAt: Date.now(),
    });
  }
}
