import { memo } from "react";
import { Rect } from "react-konva";
import { RULER_HEIGHT, TRACK_HEIGHT } from "@/lib/timelineConstants";

interface TrackLaneProps {
  trackIndex: number;
  width: number;
  scrollTop: number;
  borderColor: string;
  /** Whether this track is highlighted (target of cross-track drag) */
  isDropTarget?: boolean;
}

export const TrackLane = memo(function TrackLane({
  trackIndex,
  width,
  scrollTop,
  borderColor,
  isDropTarget,
}: TrackLaneProps) {
  const y = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollTop;

  return (
    <>
      {isDropTarget && (
        <Rect
          x={0}
          y={y}
          width={width}
          height={TRACK_HEIGHT}
          fill="#ffffff"
          opacity={0.08}
          listening={false}
        />
      )}
      <Rect
        x={0}
        y={y + TRACK_HEIGHT - 1}
        width={width}
        height={1}
        fill={borderColor}
        listening={false}
      />
    </>
  );
});
