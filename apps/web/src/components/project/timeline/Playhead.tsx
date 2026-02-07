import { memo } from "react";
import { Line } from "react-konva";

interface PlayheadProps {
  /** Playhead X position in canvas pixels (already adjusted for scroll) */
  x: number;
  height: number;
  color: string;
}

export const Playhead = memo(function Playhead({ x, height, color }: PlayheadProps) {
  if (x < 0) return null;

  return (
    <Line
      points={[x, 0, x, height]}
      stroke={color}
      strokeWidth={1}
      listening={false}
    />
  );
});
