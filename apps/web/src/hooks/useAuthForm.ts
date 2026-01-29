import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type AuthCallbackOptions = {
  onSuccess: () => void;
  onError: (error: { error: { message?: string; statusText?: string } }) => void;
};

export function useAuthForm(successMessage: string) {
  const navigate = useNavigate({ from: "/" });
  const [formError, setFormError] = useState<string | null>(null);

  const clearFormError = useCallback(() => {
    setFormError((current) => (current ? null : current));
  }, []);

  const authCallbacks: AuthCallbackOptions = {
    onSuccess: () => {
      navigate({ to: "/" });
      toast.success(successMessage);
    },
    onError: (error) => {
      const errorMessage = error.error.message || error.error.statusText || "An error occurred";
      setFormError(errorMessage);
      toast.error(errorMessage);
    },
  };

  const handleSubmitStart = useCallback(() => {
    setFormError(null);
  }, []);

  return {
    formError,
    clearFormError,
    authCallbacks,
    handleSubmitStart,
  };
}
