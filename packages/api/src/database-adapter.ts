import { db } from "@el-audio-daw/db";
import { schema } from "@el-audio-daw/zero/schema";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

export const dbProvider = zeroDrizzle(schema, db);
