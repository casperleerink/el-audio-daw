import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getTrackColor } from "@/lib/canvasRenderer";

interface EffectsPanelProps {
  selectedTrackId: string | null;
  selectedTrackName: string;
  selectedTrackIndex: number;
  onClose: () => void;
  children: React.ReactNode;
  onAddEffect: () => void;
}

export function EffectsPanel({
  selectedTrackId,
  selectedTrackName,
  selectedTrackIndex,
  onClose,
  children,
  onAddEffect,
}: EffectsPanelProps) {
  const trackColor = getTrackColor(selectedTrackIndex);

  if (!selectedTrackId) return null;

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-t bg-muted/20">
      {/* Panel Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/30 px-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-1 rounded-full" style={{ backgroundColor: trackColor }} />
          <span className="text-xs font-medium">{selectedTrackName} Effects</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </Button>
      </div>

      {/* Effect Chain */}
      <div className="flex flex-1 items-center gap-2 overflow-x-auto p-3">
        {children}

        {/* Add Effect Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-[120px] w-[80px] shrink-0 flex-col gap-1 border-dashed"
          onClick={onAddEffect}
        >
          <PlusIcon className="size-5" />
          <span className="text-[10px]">Add</span>
        </Button>
      </div>
    </div>
  );
}
