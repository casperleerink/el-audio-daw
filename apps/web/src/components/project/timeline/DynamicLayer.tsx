import { memo, useMemo } from "react";
import { Group } from "react-konva";
import { getCanvasColors } from "@/lib/timelineUtils";
import { Playhead } from "./Playhead";
import { HoverIndicator } from "./HoverIndicator";

interface DynamicLayerProps {
  width: number;
  height: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  playheadTimeRef: React.RefObject<number>;
  hoverXRef: React.RefObject<number | null>;
  hoverTimeRef: React.RefObject<number | null>;
}

export const DynamicLayer = memo(function DynamicLayer({
  width,
  height,
  scrollLeft,
  pixelsPerSecond,
  playheadTimeRef,
  hoverXRef,
  hoverTimeRef,
}: DynamicLayerProps) {
  const colors = useMemo(() => getCanvasColors(), []);

  // Calculate playhead X from time ref
  const viewStartTime = scrollLeft / pixelsPerSecond;
  const playheadX = (playheadTimeRef.current - viewStartTime) * pixelsPerSecond;

  return (
    <Group>
      <Playhead x={playheadX} height={height} color={colors.muted} />
      <HoverIndicator
        hoverX={hoverXRef.current}
        hoverTime={hoverTimeRef.current}
        stageWidth={width}
        stageHeight={height}
        color={colors.muted}
      />
    </Group>
  );
});
