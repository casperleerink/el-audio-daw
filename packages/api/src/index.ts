import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./auth.js";
import { zeroRoutes } from "./zero.js";

const app = new Hono();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: ["http://localhost:3001", "http://localhost:4848"],
    credentials: true,
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/zero", zeroRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`✓ API server running at http://localhost:${port}`);
