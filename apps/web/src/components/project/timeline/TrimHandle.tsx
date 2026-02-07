import { memo } from "react";
import { Rect } from "react-konva";
import type Konva from "konva";
import { CLIP_BORDER_RADIUS, TRIM_HANDLE_WIDTH } from "@/lib/timelineConstants";

interface TrimHandleProps {
  edge: "left" | "right";
  clipWidth: number;
  clipHeight: number;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMouseDown?: (edge: "left" | "right", e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export const TrimHandle = memo(function TrimHandle({
  edge,
  clipWidth,
  clipHeight,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
}: TrimHandleProps) {
  // Don't render if clip is too narrow for handles
  if (clipWidth < TRIM_HANDLE_WIDTH * 2) return null;

  const x = edge === "left" ? 0 : clipWidth - TRIM_HANDLE_WIDTH;
  const cornerRadius =
    edge === "left"
      ? [CLIP_BORDER_RADIUS, 0, 0, CLIP_BORDER_RADIUS]
      : [0, CLIP_BORDER_RADIUS, CLIP_BORDER_RADIUS, 0];

  return (
    <Rect
      x={x}
      y={0}
      width={TRIM_HANDLE_WIDTH}
      height={clipHeight}
      fill="#ffffff"
      opacity={isHovered ? 0.5 : 0.2}
      cornerRadius={cornerRadius}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          const container = stage.container();
          container.style.cursor = "ew-resize";
        }
        onMouseEnter();
      }}
      onMouseDown={(e) => {
        onMouseDown?.(edge, e);
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          const container = stage.container();
          container.style.cursor = "crosshair";
        }
        onMouseLeave();
      }}
    />
  );
});
