import type { HTMLInputTypeAttribute } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormFieldProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  name: string;
  label: string;
  type?: HTMLInputTypeAttribute;
  onInputChange?: () => void;
};

export function TanStackFormField({ form, name, label, type, onInputChange }: FormFieldProps) {
  return (
    <div>
      <form.Field name={name}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>{label}</Label>
            <Input
              id={field.name}
              name={field.name}
              type={type}
              value={field.state.value as string}
              onBlur={field.handleBlur}
              onChange={(e) => {
                onInputChange?.();
                field.handleChange(e.target.value);
              }}
            />
            {field.state.meta.errors.map((error: { message?: string } | undefined) => (
              <p key={error?.message} className="text-red-500">
                {error?.message}
              </p>
            ))}
          </div>
        )}
      </form.Field>
    </div>
  );
}
