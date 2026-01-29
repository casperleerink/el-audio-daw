import { useCallback, useEffect, useRef, useState } from "react";

interface UseTrackNameEditOptions {
  initialName: string;
  onNameChange: (name: string) => void;
}

interface UseTrackNameEditReturn {
  isEditing: boolean;
  editName: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  startEditing: () => void;
  cancelEditing: () => void;
  setEditName: (name: string) => void;
  handleSubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Hook to manage track name inline editing state and behavior.
 * Handles focus management, keyboard interactions (Enter to submit, Escape to cancel),
 * and input selection on edit start.
 */
export function useTrackNameEdit({
  initialName,
  onNameChange,
}: UseTrackNameEditOptions): UseTrackNameEditReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus and select input text when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Reset edit name when initial name changes (e.g., from server)
  useEffect(() => {
    if (!isEditing) {
      setEditName(initialName);
    }
  }, [initialName, isEditing]);

  const startEditing = useCallback(() => {
    setEditName(initialName);
    setIsEditing(true);
  }, [initialName]);

  const cancelEditing = useCallback(() => {
    setEditName(initialName);
    setIsEditing(false);
  }, [initialName]);

  const handleSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== initialName) {
      onNameChange(trimmed);
    } else {
      setEditName(initialName);
    }
    setIsEditing(false);
  }, [editName, initialName, onNameChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "Escape") {
        cancelEditing();
      }
    },
    [handleSubmit, cancelEditing],
  );

  return {
    isEditing,
    editName,
    inputRef,
    startEditing,
    cancelEditing,
    setEditName,
    handleSubmit,
    handleKeyDown,
  };
}
