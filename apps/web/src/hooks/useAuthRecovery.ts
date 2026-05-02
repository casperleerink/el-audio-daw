import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

// Better Auth's cookieCache (see packages/auth/src/index.ts) lets the client
// trust a signed session cookie without a DB roundtrip. If the DB is wiped
// (e.g. `bun db:reset`) the cookie outlives the session row and useSession
// keeps reporting a logged-in user that no longer exists upstream — Zero
// queries silently return no rows because the user ID is orphaned.
//
// On mount, force one server-validated check that bypasses the cookie cache.
// If the DB disagrees with the cached session, sign out so the UI falls back
// to the unauthenticated path instead of showing an empty dashboard.
export function useAuthRecovery() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    authClient
      .getSession({ query: { disableCookieCache: true } })
      .then((result) => {
        if (cancelled) return;
        if (!result.data?.user) {
          authClient.signOut();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
