import type { StandardSchemaV1 } from "@tanstack/react-form";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";

import { useAuthForm } from "@/hooks/useAuthForm";

import { Button } from "./ui/button";
import { FormErrorAlert } from "./ui/form-error-alert";
import { TanStackFormField } from "./ui/tanstack-form-field";

type AuthFormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
};

type AuthCallbackOptions = {
  onSuccess: () => void;
  onError: (error: { error: { message?: string; statusText?: string } }) => void;
};

type AuthFormProps<TValues extends Record<string, string>> = {
  title: string;
  successMessage: string;
  fields: AuthFormField[];
  defaultValues: TValues;
  validator: StandardSchemaV1<TValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: TValues, authCallbacks: AuthCallbackOptions) => Promise<void>;
  switchText: string;
  onSwitch: () => void;
};

export function AuthForm<TValues extends Record<string, string>>({
  title,
  successMessage,
  fields,
  defaultValues,
  validator,
  submitLabel,
  submittingLabel,
  onSubmit,
  switchText,
  onSwitch,
}: AuthFormProps<TValues>) {
  const { formError, clearFormError, authCallbacks, handleSubmitStart } =
    useAuthForm(successMessage);

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      handleSubmitStart();
      await onSubmit(value as TValues, authCallbacks);
    },
    validators: {
      onSubmit: validator,
    },
  });

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">{title}</h1>

      <FormErrorAlert message={formError} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        {fields.map((field) => (
          <TanStackFormField
            key={field.name}
            form={form}
            name={field.name}
            label={field.label}
            type={field.type}
            onInputChange={clearFormError}
          />
        ))}

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
                  {submittingLabel}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button variant="link" onClick={onSwitch} className="text-indigo-600 hover:text-indigo-800">
          {switchText}
        </Button>
      </div>
    </div>
  );
}
