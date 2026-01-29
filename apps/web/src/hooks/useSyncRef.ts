import { useRef } from "react";

/**
 * Hook to keep a ref synchronized with a value.
 * Useful for accessing current values in event handlers or callbacks
 * without needing to include them in dependency arrays.
 *
 * @param value The value to sync to the ref
 * @returns A ref that always contains the current value
 */
export function useSyncRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
