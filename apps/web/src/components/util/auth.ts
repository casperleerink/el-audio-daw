import { authClient } from "@/lib/auth-client";

export const Authenticated = ({ children }: { children: React.ReactNode }) => {
  const { data: session } = authClient.useSession();
  if (!session) {
    return null;
  }
  return children;
};

export const Unauthenticated = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session } = authClient.useSession();
  if (session) {
    return null;
  }
  return children;
};

export const AuthLoading = ({ children }: { children: React.ReactNode }) => {
  const { data: session } = authClient.useSession();
  if (session === undefined) {
    return children;
  }
  return null;
};
