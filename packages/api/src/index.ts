import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./auth.js";
import { zeroRoutes } from "./zero.js";
import { uploadRoutes } from "./upload.js";
import { auth } from "@el-audio-daw/auth";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session | null;
  };
}>();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001", "http://localhost:4848"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  c.set("session", session);
  c.set("user", session.user);
  await next();
});

app.route("/api/auth", authRoutes);
app.route("/api/zero", zeroRoutes);
app.route("/api/storage", uploadRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ API server running at http://localhost:${port}`);
