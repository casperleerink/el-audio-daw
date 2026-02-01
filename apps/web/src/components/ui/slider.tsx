import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";
import { useEffect, useMemo } from "react";

interface SliderProps extends SliderPrimitive.Root.Props {
  /** Called when the user releases the slider (mouseup/touchend) */
  onValueCommit?: (value: number | readonly number[]) => void;
  /** Make the slider track transparent (useful when overlaying on meters) */
  transparentTrack?: boolean;
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueCommit,
  transparentTrack = false,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      onValueCommitted={(v) => {
        if (onValueCommit) {
          onValueCommit(v);
        }
      }}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "rounded-sm data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-2 relative grow overflow-hidden select-none",
            transparentTrack ? "bg-transparent" : "bg-muted",
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              "select-none data-horizontal:h-full data-vertical:w-full",
              transparentTrack ? "bg-transparent" : "bg-primary",
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: Array.isArray(value) ? value.length : 1 }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative size-3.5 rounded-full border-2 border-white bg-white shadow-md ring-ring/50 transition-all after:absolute after:-inset-2 hover:scale-110 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-hidden active:scale-95 block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
