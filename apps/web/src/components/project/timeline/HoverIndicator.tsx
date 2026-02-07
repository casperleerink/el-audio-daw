import { memo } from "react";
import { Group, Line, Rect, Text } from "react-konva";
import { RULER_HEIGHT } from "@/lib/timelineConstants";

interface HoverIndicatorProps {
  /** Hover X position in canvas pixels (null if not hovering) */
  hoverX: number | null;
  /** Hover time in seconds (null if not hovering) */
  hoverTime: number | null;
  stageWidth: number;
  stageHeight: number;
  color: string;
}

function formatTimeForTooltip(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export const HoverIndicator = memo(function HoverIndicator({
  hoverX,
  hoverTime,
  stageWidth,
  stageHeight,
  color,
}: HoverIndicatorProps) {
  if (hoverX === null) return null;

  const showTooltip = hoverTime !== null;
  const tooltipText = showTooltip ? formatTimeForTooltip(hoverTime) : "";
  const tooltipWidth = tooltipText.length * 7 + 12; // approximate
  const tooltipHeight = 18;
  const tooltipY = RULER_HEIGHT + 4;

  // Position tooltip — flip if near right edge
  let tooltipX: number;
  if (hoverX > stageWidth - tooltipWidth - 10) {
    tooltipX = hoverX - tooltipWidth;
  } else {
    tooltipX = hoverX - tooltipWidth / 2;
  }
  tooltipX = Math.max(2, tooltipX);

  return (
    <Group listening={false}>
      {/* Dashed hover line */}
      <Line
        points={[hoverX, 0, hoverX, stageHeight]}
        stroke={color}
        strokeWidth={1}
        opacity={0.4}
        dash={[4, 4]}
      />

      {/* Tooltip background */}
      {showTooltip && (
        <>
          <Rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipWidth}
            height={tooltipHeight}
            fill="#f5f5f5"
            cornerRadius={3}
          />
          <Text
            x={tooltipX + 6}
            y={tooltipY}
            height={tooltipHeight}
            text={tooltipText}
            fontSize={11}
            fontFamily="monospace"
            fill="#171717"
            verticalAlign="middle"
          />
        </>
      )}
    </Group>
  );
});
