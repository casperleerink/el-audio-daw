import { useEffect, useState } from "react";
import { Stage, Layer } from "react-konva";
import type Konva from "konva";

interface TimelineStageProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  staticLayerRef: React.RefObject<Konva.Layer | null>;
  dynamicLayerRef: React.RefObject<Konva.Layer | null>;
  children: React.ReactNode;
  dynamicChildren: React.ReactNode;
  onContainerWheel?: (e: WheelEvent) => void;
}

export function TimelineStage({
  containerRef,
  staticLayerRef,
  dynamicLayerRef,
  children,
  dynamicChildren,
  onContainerWheel,
}: TimelineStageProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  // Attach wheel event with passive: false for preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onContainerWheel) return;

    container.addEventListener("wheel", onContainerWheel, { passive: false });
    return () => container.removeEventListener("wheel", onContainerWheel);
  }, [containerRef, onContainerWheel]);

  if (dimensions.width === 0 || dimensions.height === 0) return null;

  return (
    <Stage width={dimensions.width} height={dimensions.height}>
      <Layer ref={staticLayerRef}>{children}</Layer>
      <Layer ref={dynamicLayerRef}>{dynamicChildren}</Layer>
    </Stage>
  );
}
