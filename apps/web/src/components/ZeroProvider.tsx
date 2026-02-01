import type { PropsWithChildren } from "react";
import { ZeroProvider as ZeroReactProvider } from "@rocicorp/zero/react";
import { authClient } from "@/lib/auth-client";
import { schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import { env } from "@el-audio-daw/env/web";

export function ZeroProvider({ children }: PropsWithChildren) {
  const { data: session } = authClient.useSession();
  const userID = session?.user?.id ?? "";

  return (
    <ZeroReactProvider
      schema={schema}
      mutators={mutators}
      cacheURL={env.VITE_ZERO_CACHE_URL}
      userID={userID}
      context={{ userID }}
    >
      {children}
    </ZeroReactProvider>
  );
}

export type ZeroContext = {
  userID: string;
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroContext;
  }
}
