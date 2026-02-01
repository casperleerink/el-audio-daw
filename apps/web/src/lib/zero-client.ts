import { Zero } from "@rocicorp/zero";
import { schema, type Schema } from "@el-audio-daw/zero/schema";
import { queries, type Queries } from "@el-audio-daw/zero/queries";
import { mutators, type Mutators } from "@el-audio-daw/zero/mutators";

export function createZeroClient(userID: string) {
  return new Zero({
    userID,
    schema,
    queries,
    mutators,
    server: import.meta.env.VITE_ZERO_URL || "http://localhost:4848",
  });
}

export type ZeroClient = ReturnType<typeof createZeroClient>;

// Re-export for convenience
export { schema, queries, mutators };
export type { Schema, Queries, Mutators };
