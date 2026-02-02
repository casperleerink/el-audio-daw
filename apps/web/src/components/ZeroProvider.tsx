import { useCallback, type PropsWithChildren } from "react";
import { ZeroProvider as ZeroReactProvider } from "@rocicorp/zero/react";
import { authClient } from "@/lib/auth-client";
import { schema } from "@el-audio-daw/zero/schema";
import { mutators } from "@el-audio-daw/zero/mutators";
import { env } from "@el-audio-daw/env/web";
import { useRouter } from "@tanstack/react-router";
import type { Zero } from "@rocicorp/zero";

export function ZeroProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userID = session?.user?.id ?? "anon";

  const init = useCallback(
    (zero: Zero) => {
      router.update({
        context: {
          ...router.options.context,
          zero,
        },
      });
      router.invalidate();
    },
    [router]
  );

  return (
    <ZeroReactProvider
      schema={schema}
      mutators={mutators}
      cacheURL={env.VITE_ZERO_CACHE_URL}
      userID={userID}
      context={{ userID }}
      init={init}
    >
      {children}
    </ZeroReactProvider>
  );
}

type ZeroContext = {
  userID: string;
};

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: ZeroContext;
  }
}
