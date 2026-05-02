import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),
    STORAGE_ENDPOINT: z.string().url(),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    STORAGE_BUCKET_NAME: z.string().min(1),
    STORAGE_REGION: z.string().min(1).default("auto"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
