import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ZeroProvider as ZeroReactProvider } from "@rocicorp/zero/react";
import { createZeroClient, type ZeroClient } from "@/lib/zero-client";
import { authClient } from "@/lib/auth-client";

const ZeroContext = createContext<ZeroClient | null>(null);

export function useZeroClient() {
  const client = useContext(ZeroContext);
  if (!client) {
    throw new Error("useZeroClient must be used within ZeroProvider");
  }
  return client;
}

interface ZeroProviderProps {
  children: ReactNode;
}

export function ZeroProvider({ children }: ZeroProviderProps) {
  const [zero, setZero] = useState<ZeroClient | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const userID = session?.user?.id ?? "";

    const client = createZeroClient(userID);
    setZero(client);

    return () => {
      client.close();
    };
  }, [session?.user?.id]);

  if (!zero) {
    return null;
  }

  return (
    <ZeroContext.Provider value={zero}>
      <ZeroReactProvider zero={zero}>{children}</ZeroReactProvider>
    </ZeroContext.Provider>
  );
}
