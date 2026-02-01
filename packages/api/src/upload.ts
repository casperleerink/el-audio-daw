import { Hono, type Context } from "hono";
import { getPresignedUploadUrl, getPresignedDownloadUrl } from "./r2.js";
import { db } from "@el-audio-daw/db";
import { projectUsers } from "@el-audio-daw/db/schema";
import { eq, and } from "drizzle-orm";

export const uploadRoutes = new Hono();

async function getUserId(c: Context): Promise<string | null> {
  const user = c.get("user");
  if (!user) {
    return null;
  }

  return user.id;
}

async function userHasProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  const result = await db
    .select()
    .from(projectUsers)
    .where(
      and(
        eq(projectUsers.userId, userId),
        eq(projectUsers.projectId, projectId)
      )
    )
    .limit(1);

  return result.length > 0;
}

uploadRoutes.post("/upload", async (c) => {
  // Validate auth
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json<{
    projectId: string;
    filename: string;
    contentType: string;
  }>();

  const { projectId, filename, contentType } = body;

  if (!projectId || !filename || !contentType) {
    return c.json(
      { error: "Missing required fields: projectId, filename, contentType" },
      400
    );
  }

  // Validate user has access to project
  const hasAccess = await userHasProjectAccess(userId, projectId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Generate unique key for the file
  const uuid = crypto.randomUUID();
  const key = `projects/${projectId}/audio/${uuid}-${filename}`;

  try {
    // Generate presigned URL for upload
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return c.json({
      uploadUrl,
      key,
    });
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    return c.json({ error: "Failed to generate upload URL" }, 500);
  }
});

uploadRoutes.post("/download-url", async (c) => {
  // Validate auth
  const userId = await getUserId(c);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Parse request body
  const body = await c.req.json<{
    projectId: string;
    key: string;
  }>();

  const { projectId, key } = body;

  if (!projectId || !key) {
    return c.json({ error: "Missing required fields: projectId, key" }, 400);
  }

  // Validate user has access to project
  const hasAccess = await userHasProjectAccess(userId, projectId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Validate the key belongs to this project
  if (!key.startsWith(`projects/${projectId}/`)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(key);
    return c.json({ downloadUrl });
  } catch (error) {
    console.error("Failed to generate download URL:", error);
    return c.json({ error: "Failed to generate download URL" }, 500);
  }
});
