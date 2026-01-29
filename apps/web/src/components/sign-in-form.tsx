import z from "zod";

import { authClient } from "@/lib/auth-client";

import { AuthForm } from "./auth-form";

const signInSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignInValues = z.infer<typeof signInSchema>;

const signInFields = [
  { name: "email", label: "Email", type: "email" as const },
  { name: "password", label: "Password", type: "password" as const },
];

const signInDefaultValues: SignInValues = {
  email: "",
  password: "",
};

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  return (
    <AuthForm<SignInValues>
      title="Welcome Back"
      successMessage="Sign in successful"
      fields={signInFields}
      defaultValues={signInDefaultValues}
      validator={signInSchema}
      submitLabel="Sign In"
      submittingLabel="Signing in..."
      onSubmit={async (values, authCallbacks) => {
        await authClient.signIn.email(
          {
            email: values.email,
            password: values.password,
          },
          authCallbacks,
        );
      }}
      switchText="Need an account? Sign Up"
      onSwitch={onSwitchToSignUp}
    />
  );
}
