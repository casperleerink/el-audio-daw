import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import z from "zod";

import { useAuthForm } from "@/hooks/useAuthForm";
import { authClient } from "@/lib/auth-client";

import { Button } from "./ui/button";
import { FormErrorAlert } from "./ui/form-error-alert";
import { TanStackFormField } from "./ui/tanstack-form-field";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const { formError, clearFormError, authCallbacks, handleSubmitStart } =
    useAuthForm("Sign in successful");

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      handleSubmitStart();
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        authCallbacks,
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Welcome Back</h1>

      <FormErrorAlert message={formError} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <TanStackFormField
          form={form}
          name="email"
          label="Email"
          type="email"
          onInputChange={clearFormError}
        />

        <TanStackFormField
          form={form}
          name="password"
          label="Password"
          type="password"
          onInputChange={clearFormError}
        />

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
