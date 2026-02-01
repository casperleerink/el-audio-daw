import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { auth } from "@el-audio-daw/auth";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import {
  handleQueryRequest,
  handleMutateRequest,
} from "@rocicorp/zero/server";
import { db } from "@el-audio-daw/db";

export const zeroRoutes = new Hono();

async function getContext(c: any) {
  const sessionToken = getCookie(c, "better-auth.session_token");

  if (!sessionToken) {
    return { userID: "" };
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return { userID: "" };
  }

  return { userID: session.user.id };
}

zeroRoutes.post("/query", async (c) => {
  const ctx = await getContext(c);

  return handleQueryRequest({
    request: c.req.raw,
    queries,
    context: ctx,
  });
});

zeroRoutes.post("/mutate", async (c) => {
  const ctx = await getContext(c);

  if (!ctx.userID) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return handleMutateRequest({
    request: c.req.raw,
    mutators,
    context: ctx,
    getDB: () => db,
  });
});
