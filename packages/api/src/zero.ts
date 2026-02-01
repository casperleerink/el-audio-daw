import { Hono, type Context } from "hono";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import { schema } from "@el-audio-daw/zero/schema";
import { handleQueryRequest, handleMutateRequest } from "@rocicorp/zero/server";
import { mustGetQuery, mustGetMutator } from "@rocicorp/zero";
import type { ZeroContext } from "@el-audio-daw/zero";
import { dbProvider } from "./database-adapter";

export const zeroRoutes = new Hono();

async function getContext(c: Context): Promise<ZeroContext> {
  const session = c.get("session");
  const user = c.get("user");

  if (!session || !user) {
    return { userID: "anon" };
  }

  return { userID: user.id };
}

zeroRoutes.post("/query", async (c) => {
  const ctx = await getContext(c);

  const result = await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx });
    },
    schema,
    c.req.raw
  );

  return c.json(result);
});

zeroRoutes.post("/mutate", async (c) => {
  const ctx = await getContext(c);

  const result = await handleMutateRequest(
    dbProvider,
    (transact) =>
      transact((tx, name, args) => {
        const mutator = mustGetMutator(mutators, name);
        return mutator.fn({
          args,
          tx,
          ctx,
        });
      }),
    c.req.raw
  );

  return c.json(result);
});
