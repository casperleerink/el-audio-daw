import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { auth } from "@el-audio-daw/auth";
import { queries } from "@el-audio-daw/zero/queries";
import { mutators } from "@el-audio-daw/zero/mutators";
import { schema, type ZeroContext } from "@el-audio-daw/zero/schema";
import { handleQueryRequest, handleMutateRequest, type Database } from "@rocicorp/zero/server";
import { mustGetQuery, mustGetMutator, type QueryRequest } from "@rocicorp/zero";
import { db } from "@el-audio-daw/db";

export const zeroRoutes = new Hono();

async function getContext(c: any): Promise<ZeroContext> {
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

// Create a database adapter for Zero
const zeroDatabase: Database<typeof db> = {
  transaction: async (callback, _input) => {
    // For now, use a simple transaction wrapper
    // In production, you'd want proper transaction handling
    return callback(db as any, {
      updateClientMutationID: async () => ({ lastMutationID: 0 }),
      writeMutationResult: async () => {},
    });
  },
};

zeroRoutes.post("/query", async (c) => {
  const ctx = await getContext(c);

  const result = await handleQueryRequest(
    (name, args) => {
      const queryDef = mustGetQuery(queries, name);
      const queryRequest = queryDef(args) as QueryRequest<any, any, any, any, any, ZeroContext>;
      // Convert query request to query by invoking the function with context
      return queryRequest.query.fn({ args: queryRequest.args, ctx });
    },
    schema,
    c.req.raw,
  );

  return c.json(result);
});

zeroRoutes.post("/mutate", async (c) => {
  const ctx = await getContext(c);

  if (!ctx.userID) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await handleMutateRequest(
    zeroDatabase,
    async (transact, _mutation) => {
      return transact(async (tx, mutatorName, mutatorArgs) => {
        const mutator = mustGetMutator(mutators, mutatorName);
        await mutator({
          tx: tx as any,
          ctx,
          args: mutatorArgs,
        });
      });
    },
    c.req.raw,
  );

  return c.json(result);
});
