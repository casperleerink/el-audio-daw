import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, zql } from "@el-audio-daw/zero";

import { Input } from "@/components/ui/input";

interface TrackNameInputProps {
  trackId: string;
}

export function TrackNameInput({ trackId }: TrackNameInputProps) {
  const z = useZero();
  const [track] = useQuery(zql.tracks.where("id", trackId).one());

  const name = track?.name ?? "";
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from server when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditName(name);
    }
  }, [name, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      z.mutate(mutators.tracks.update({ id: trackId, name: trimmed }));
    } else {
      setEditName(name);
    }
    setIsEditing(false);
  }, [z, trackId, editName, name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "Escape") {
        setEditName(name);
        setIsEditing(false);
      }
    },
    [handleSubmit, name],
  );

  if (isEditing) {
    return (
      <div className="flex flex-1 items-center gap-1">
        <Input
          ref={inputRef}
          className="h-6 flex-1 border-ring text-xs ring-1 ring-ring/50"
          value={editName}
          maxLength={50}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
        />
        {editName.length >= 40 && (
          <span
            className={`shrink-0 text-[10px] ${editName.length >= 50 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {editName.length}/50
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      className="group flex flex-1 items-center gap-1 truncate text-left text-sm font-medium hover:text-foreground/80"
      onClick={startEditing}
    >
      <span className="truncate">{name}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
