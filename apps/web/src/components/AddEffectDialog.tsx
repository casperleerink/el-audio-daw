import { SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EffectType = "filter";

interface AddEffectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectEffect: (type: EffectType) => void;
}

interface EffectOption {
  type: EffectType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const effectOptions: EffectOption[] = [
  {
    type: "filter",
    name: "Filter",
    description: "SVF filter with lowpass, highpass, bandpass, and notch modes",
    icon: <SlidersHorizontalIcon className="size-6" />,
  },
  // Future effects will be added here
];

export function AddEffectDialog({ open, onOpenChange, onSelectEffect }: AddEffectDialogProps) {
  const handleSelect = (type: EffectType) => {
    onSelectEffect(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Effect</DialogTitle>
          <DialogDescription>Choose an effect to add to the chain</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          {effectOptions.map((option) => (
            <Button
              key={option.type}
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal p-3"
              onClick={() => handleSelect(option.type)}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                {option.icon}
              </div>
              <div className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-left text-xs text-muted-foreground">{option.description}</span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
