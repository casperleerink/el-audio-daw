import * as React from "react";
import { cn } from "@/lib/utils";

interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  size?: number;
  className?: string;
  disabled?: boolean;
  /** Accent color for the indicator (CSS color string) */
  accentColor?: string;
}

/**
 * Rotary knob control for audio parameters (e.g., pan).
 * Uses vertical drag interaction: drag up = increase, drag down = decrease.
 * Visual design: arc with gap at bottom, diamond indicator that rotates.
 */
function Knob({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onCommit,
  size = 24,
  className,
  disabled = false,
  accentColor = "hsl(var(--primary))",
}: KnobProps) {
  const knobRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startY = React.useRef(0);
  const startValue = React.useRef(value);
  const currentValue = React.useRef(value);

  // Keep currentValue in sync with prop
  React.useEffect(() => {
    currentValue.current = value;
  }, [value]);

  // Sensitivity: pixels per full range
  const sensitivity = 100;

  const clamp = React.useCallback(
    (val: number) => {
      const clamped = Math.max(min, Math.min(max, val));
      // Round to step
      return Math.round(clamped / step) * step;
    },
    [min, max, step],
  );

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      startValue.current = value;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [value, disabled],
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || disabled) return;
      const deltaY = startY.current - e.clientY; // Invert: up = positive
      const range = max - min;
      const deltaValue = (deltaY / sensitivity) * range;
      const newValue = clamp(startValue.current + deltaValue);
      currentValue.current = newValue;
      onChange(newValue);
    },
    [min, max, sensitivity, clamp, onChange, disabled],
  );

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (onCommit) {
        onCommit(currentValue.current);
      }
    },
    [onCommit],
  );

  // Calculate rotation angle for indicator
  // Map value from [min, max] to [-135, 135] degrees (270 degree range)
  const normalized = (value - min) / (max - min);
  const rotation = -135 + normalized * 270;

  // SVG arc parameters
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Arc spans 270 degrees (from -135 to +135, with gap at bottom)
  // Start angle: 135 degrees (bottom-left), End angle: 45 degrees (bottom-right)
  // Going clockwise, so we draw from 135 to 405 (which is 45 + 360)
  const startAngle = 135;
  const endAngle = 45;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = ((endAngle + 360) * Math.PI) / 180;

  const startX = center + radius * Math.cos(startRad);
  const startY_ = center + radius * Math.sin(startRad);
  const endX = center + radius * Math.cos(endRad);
  const endY = center + radius * Math.sin(endRad);

  // Large arc flag = 1 (arc > 180 degrees)
  const arcPath = `M ${startX} ${startY_} A ${radius} ${radius} 0 1 1 ${endX} ${endY}`;

  // Indicator (small diamond) - draw at top center, then rotate around center
  const diamondSize = Math.max(3, size / 8);
  const indicatorRadius = radius - diamondSize - 1;

  // Diamond pointing outward from center
  const diamondPath = `
    M ${center} ${center - indicatorRadius - diamondSize}
    L ${center + diamondSize * 0.6} ${center - indicatorRadius}
    L ${center} ${center - indicatorRadius + diamondSize * 0.4}
    L ${center - diamondSize * 0.6} ${center - indicatorRadius}
    Z
  `;

  return (
    <div
      ref={knobRef}
      className={cn(
        "relative cursor-grab select-none touch-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={{ width: size, height: size }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <svg width={size} height={size} className="overflow-visible">
        {/* Background arc (track) */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted-foreground/40"
        />
        {/* Indicator diamond */}
        <path
          d={diamondPath}
          fill={accentColor}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${center}px ${center}px`,
          }}
        />
      </svg>
    </div>
  );
}

export { Knob };
