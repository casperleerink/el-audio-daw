import z from "zod";

import { authClient } from "@/lib/auth-client";

import { AuthForm } from "./auth-form";

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpValues = z.infer<typeof signUpSchema>;

const signUpFields = [
  { name: "name", label: "Name" },
  { name: "email", label: "Email", type: "email" as const },
  { name: "password", label: "Password", type: "password" as const },
];

const signUpDefaultValues: SignUpValues = {
  name: "",
  email: "",
  password: "",
};

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  return (
    <AuthForm<SignUpValues>
      title="Create Account"
      successMessage="Sign up successful"
      fields={signUpFields}
      defaultValues={signUpDefaultValues}
      validator={signUpSchema}
      submitLabel="Sign Up"
      submittingLabel="Signing up..."
      onSubmit={async (values, authCallbacks) => {
        await authClient.signUp.email(
          {
            email: values.email,
            password: values.password,
            name: values.name,
          },
          authCallbacks,
        );
      }}
      switchText="Already have an account? Sign In"
      onSwitch={onSwitchToSignIn}
    />
  );
}
