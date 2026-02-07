import { memo, useMemo } from "react";
import { Group, Rect, Text } from "react-konva";
import { RULER_HEIGHT } from "@/lib/timelineConstants";

interface TimeRulerProps {
  width: number;
  scrollLeft: number;
  pixelsPerSecond: number;
  borderColor: string;
  mutedColor: string;
}

export const TimeRuler = memo(function TimeRuler({
  width,
  scrollLeft,
  pixelsPerSecond,
  borderColor,
  mutedColor,
}: TimeRulerProps) {
  const markers = useMemo(() => {
    const startTime = scrollLeft / pixelsPerSecond;
    const visibleDuration = width / pixelsPerSecond;
    const endTime = startTime + visibleDuration;

    // Calculate marker interval based on zoom level
    const minPixelsBetweenMarkers = 60;
    let markerInterval = 1;
    while (markerInterval * pixelsPerSecond < minPixelsBetweenMarkers) {
      markerInterval *= 2;
    }

    const items: { x: number; label: string }[] = [];
    const firstMarker = Math.floor(startTime / markerInterval) * markerInterval;
    for (let time = firstMarker; time <= endTime; time += markerInterval) {
      const x = (time - startTime) * pixelsPerSecond;
      if (x < 0) continue;
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      items.push({ x, label: `${mins}:${secs.toString().padStart(2, "0")}` });
    }
    return items;
  }, [width, scrollLeft, pixelsPerSecond]);

  return (
    <Group listening={false}>
      {/* Ruler bottom border */}
      <Rect x={0} y={RULER_HEIGHT - 1} width={width} height={1} fill={borderColor} />
      {markers.map((m) => (
        <Group key={m.label + m.x} x={m.x}>
          {/* Tick mark */}
          <Rect y={RULER_HEIGHT - 8} width={1} height={8} fill={mutedColor} />
          {/* Time label */}
          <Text
            text={m.label}
            y={2}
            fontSize={10}
            fontFamily="monospace"
            fill={mutedColor}
            align="center"
            offsetX={0}
          />
        </Group>
      ))}
    </Group>
  );
});
