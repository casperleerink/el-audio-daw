import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface FormErrorAlertProps {
  message: string | null;
  className?: string;
}

export function FormErrorAlert({ message, className }: FormErrorAlertProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
        className,
      )}
    >
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
