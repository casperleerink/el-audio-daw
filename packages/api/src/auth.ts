import { Hono } from "hono";
import { auth } from "@el-audio-daw/auth";

export const authRoutes = new Hono();

authRoutes.on(["GET", "POST"], "/*", (c) => {
  return auth.handler(c.req.raw);
});
