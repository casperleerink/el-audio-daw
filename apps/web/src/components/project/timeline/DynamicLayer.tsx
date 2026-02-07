import { useMemo } from "react";
import { Shape } from "react-konva";
import type Konva from "konva";
import { getCanvasColors } from "@/lib/timelineUtils";
import { RULER_HEIGHT } from "@/lib/timelineConstants";

interface DynamicLayerProps {
  width: number;
  height: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  playheadTimeRef: React.RefObject<number>;
  hoverXRef: React.RefObject<number | null>;
  hoverTimeRef: React.RefObject<number | null>;
}

function formatTimeForTooltip(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/**
 * Dynamic layer content rendered via sceneFunc for RAF-driven animation.
 * Reads from refs at draw time (not render time), so batchDraw() picks up
 * the latest playhead position and hover state without React re-renders.
 */
export function DynamicLayer({
  width,
  height,
  scrollLeft,
  pixelsPerSecond,
  playheadTimeRef,
  hoverXRef,
  hoverTimeRef,
}: DynamicLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  return (
    <Shape
      sceneFunc={(context: Konva.Context) => {
        const ctx = context._context;

        // Draw playhead
        const viewStartTime = scrollLeft / pixelsPerSecond;
        const playheadX = (playheadTimeRef.current - viewStartTime) * pixelsPerSecond;

        if (playheadX >= 0 && playheadX <= width) {
          ctx.beginPath();
          ctx.strokeStyle = colors.muted;
          ctx.lineWidth = 1;
          ctx.moveTo(playheadX, 0);
          ctx.lineTo(playheadX, height);
          ctx.stroke();
        }

        // Draw hover indicator
        const hoverX = hoverXRef.current;
        const hoverTime = hoverTimeRef.current;
        if (hoverX !== null) {
          ctx.beginPath();
          ctx.strokeStyle = colors.muted;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(hoverX, 0);
          ctx.lineTo(hoverX, height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          if (hoverTime !== null) {
            const text = formatTimeForTooltip(hoverTime);
            const tooltipWidth = text.length * 7 + 12;
            const tooltipHeight = 18;
            const tooltipY = RULER_HEIGHT + 4;

            let tooltipX: number;
            if (hoverX > width - tooltipWidth - 10) {
              tooltipX = hoverX - tooltipWidth;
            } else {
              tooltipX = hoverX - tooltipWidth / 2;
            }
            tooltipX = Math.max(2, tooltipX);

            ctx.fillStyle = "#f5f5f5";
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 3);
            ctx.fill();

            ctx.fillStyle = "#171717";
            ctx.font = "11px monospace";
            ctx.textBaseline = "middle";
            ctx.fillText(text, tooltipX + 6, tooltipY + tooltipHeight / 2);
          }
        }
      }}
      listening={false}
    />
  );
}
