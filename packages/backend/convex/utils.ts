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
