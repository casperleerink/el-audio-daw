import { GripVerticalIcon } from "lucide-react";

import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface EffectCardProps {
  id: string;
  name: string;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

export function EffectCard({
  id,
  name,
  enabled,
  selected,
  onSelect,
  onEnabledChange,
  onDragStart,
  onDragEnd,
  children,
}: EffectCardProps) {
  return (
    <div
      className={cn(
        "flex h-[120px] w-[140px] shrink-0 flex-col rounded border bg-background transition-colors",
        selected && "ring-2 ring-primary",
        !enabled && "opacity-60",
      )}
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-effect-id={id}
    >
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/50 px-1.5">
        <div className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVerticalIcon className="size-3" />
        </div>
        <span className="flex-1 truncate text-[10px] font-medium">{name}</span>
        <Toggle
          size="sm"
          pressed={enabled}
          onPressedChange={onEnabledChange}
          className="h-5 w-5 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn("size-2 rounded-full", enabled ? "bg-current" : "border border-current")} />
        </Toggle>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 p-2">{children}</div>
    </div>
  );
}
