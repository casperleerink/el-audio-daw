import { useCallback, useEffect, useRef, useState } from "react";

interface UseOptimisticControlOptions {
  /** Server value (may include optimistic updates) */
  serverValue: number;
  /** Called on every value change for real-time feedback */
  onChange: (value: number) => void;
  /** Called when value change is committed (control released) for server sync */
  onCommit: (value: number) => void;
}

interface UseOptimisticControlReturn {
  /** Local value for real-time UI feedback */
  localValue: number;
  /** Handler for real-time value changes (e.g., during drag) */
  handleChange: (value: number) => void;
  /** Handler for committing the final value (e.g., on release) */
  handleCommit: (value: number) => void;
}

/**
 * Hook for managing optimistic control state with server sync.
 *
 * This handles the dual-change pattern common in audio controls:
 * - Real-time UI feedback while dragging (via onChange)
 * - Server sync only on commit (via onCommit)
 *
 * The hook tracks whether the control is actively being dragged to prevent
 * server updates from clobbering local state during interaction. It also
 * compares against the last confirmed server value to avoid unnecessary
 * commits when the value hasn't actually changed.
 */
export function useOptimisticControl({
  serverValue,
  onChange,
  onCommit,
}: UseOptimisticControlOptions): UseOptimisticControlReturn {
  const [localValue, setLocalValue] = useState(serverValue);
  const isDraggingRef = useRef(false);
  // Track the last committed server value (before optimistic updates)
  const confirmedValueRef = useRef(serverValue);

  // Sync local value from server state when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalValue(serverValue);
      confirmedValueRef.current = serverValue;
    }
  }, [serverValue]);

  const handleChange = useCallback(
    (value: number) => {
      isDraggingRef.current = true;
      setLocalValue(value);
      // Update immediately for real-time feedback
      onChange(value);
    },
    [onChange],
  );

  const handleCommit = useCallback(
    (value: number) => {
      isDraggingRef.current = false;
      // Only commit to server if value changed from original server value
      // (compare against confirmedValueRef, not serverValue which has optimistic updates)
      if (value !== confirmedValueRef.current) {
        onCommit(value);
      }
    },
    [onCommit],
  );

  return {
    localValue,
    handleChange,
    handleCommit,
  };
}
