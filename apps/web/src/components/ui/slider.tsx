import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

interface SliderProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
  defaultValue?: number;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  transparentTrack?: boolean;
}

function Slider({
  orientation = "horizontal",
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueCommit,
  transparentTrack = false,
  onValueChange,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      thumbAlignment="edge"
      onValueCommitted={(v) => {
        if (onValueCommit) {
          onValueCommit(v);
        }
      }}
      orientation={orientation}
      onValueChange={onValueChange}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "rounded-sm data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-2 relative grow overflow-hidden select-none",
            transparentTrack ? "bg-transparent" : "bg-muted"
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              "select-none data-horizontal:h-full data-vertical:w-full",
              transparentTrack ? "bg-transparent" : "bg-primary"
            )}
          />
        </SliderPrimitive.Track>

        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="relative transition-none animate-none block size-3.5 rounded-full border-2 border-accent bg-accent-foreground ring-ring/50 transition-all shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
