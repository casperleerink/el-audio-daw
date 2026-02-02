import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical, Plus } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useTrackReorder } from "@/hooks/useTrackReorder";
import { getTrackColor } from "@/lib/canvasRenderer";
import { TRACK_HEADER_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { TrackDeleteButton } from "@/components/track/TrackDeleteButton";
import { TrackGainSlider } from "@/components/track/TrackGainSlider";
import { TrackMuteSoloButtons } from "@/components/track/TrackMuteSoloButtons";
import { TrackNameInput } from "@/components/track/TrackNameInput";
import { TrackPanKnob } from "@/components/track/TrackPanKnob";

interface TrackHeaderProps {
  trackId: string;
  index: number;
  isDragging?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  onDragStart: (e: React.DragEvent, trackId: string) => void;
  onDragEnd: () => void;
  onTrackSelect: (trackId: string) => void;
}

const TrackHeader = React.memo(function TrackHeader({
  trackId,
  index,
  isDragging,
  isFocused,
  isSelected,
  onDragStart,
  onDragEnd,
  onTrackSelect,
}: TrackHeaderProps) {
  const trackColor = getTrackColor(index);
  const [isDragHandleActive, setIsDragHandleActive] = useState(false);

  return (
    <div
      className={`box-border flex h-[100px] cursor-pointer border-b transition-all duration-150 ${
        isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""
      } ${isSelected ? "bg-accent/30" : ""}`}
      draggable={isDragHandleActive}
      onDragStart={(e) => onDragStart(e, trackId)}
      onDragEnd={() => {
        setIsDragHandleActive(false);
        onDragEnd();
      }}
      onClick={() => onTrackSelect(trackId)}
    >
      {/* Color strip */}
      <div
        className={`w-1 shrink-0 ${isFocused ? "ring-1 ring-inset ring-white/50" : ""}`}
        style={{ backgroundColor: trackColor }}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col justify-between px-2 py-2">
        {/* Row 1: Drag handle, name, delete */}
        <div className="flex items-center gap-1">
          <div
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            onMouseDown={() => setIsDragHandleActive(true)}
            onMouseUp={() => setIsDragHandleActive(false)}
            onMouseLeave={() => setIsDragHandleActive(false)}
          >
            <GripVertical className="size-4" />
          </div>
          <TrackNameInput trackId={trackId} />
          <TrackDeleteButton trackId={trackId} />
        </div>

        {/* Row 2: M/S buttons, pan control */}
        <div className="flex items-center justify-between">
          <TrackMuteSoloButtons trackId={trackId} />
          <TrackPanKnob trackId={trackId} />
        </div>
      </div>

      {/* Right section: Vertical meter with integrated fader */}
      <TrackGainSlider trackId={trackId} />
    </div>
  );
});

interface VirtualizedTrackListProps {
  trackIds: string[];
  scrollTop: number;
  focusedTrackId?: string | null;
  selectedTrackId?: string | null;
  onScrollChange: (scrollTop: number) => void;
  onReorder: (trackIds: string[]) => void;
  onAddTrack: () => void;
  onTrackSelect: (trackId: string) => void;
}

export const VirtualizedTrackList = React.forwardRef<HTMLDivElement, VirtualizedTrackListProps>(
  function VirtualizedTrackList(
    {
      trackIds,
      scrollTop,
      focusedTrackId,
      selectedTrackId,
      onScrollChange,
      onReorder,
      onAddTrack,
      onTrackSelect,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null);

    const {
      draggedTrackId,
      dropTargetIndex,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDrop,
    } = useTrackReorder({ trackIds, onReorder });

    useEffect(() => {
      if (parentRef.current && Math.abs(parentRef.current.scrollTop - scrollTop) > 1) {
        parentRef.current.scrollTop = scrollTop;
      }
    }, [scrollTop]);

    const virtualizer = useVirtualizer({
      count: trackIds.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => TRACK_HEADER_HEIGHT,
      overscan: 5,
    });

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        onScrollChange(e.currentTarget.scrollTop);
      },
      [onScrollChange],
    );

    React.useImperativeHandle(ref, () => parentRef.current as HTMLDivElement, []);

    if (trackIds.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <p className="text-sm text-muted-foreground">No tracks yet</p>
          <Button onClick={onAddTrack}>
            <Plus className="size-4" />
            Add Track
          </Button>
        </div>
      );
    }

    return (
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const trackId = trackIds[virtualRow.index];
            if (!trackId) return null;

            const isDragging = trackId === draggedTrackId;
            const showDropIndicatorBefore = dropTargetIndex === virtualRow.index;
            const showDropIndicatorAfter =
              dropTargetIndex === virtualRow.index + 1 && virtualRow.index === trackIds.length - 1;

            return (
              <div
                key={trackId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onDragOver={(e) => handleDragOver(e, virtualRow.index)}
              >
                {showDropIndicatorBefore && (
                  <div className="pointer-events-none absolute inset-0 rounded bg-primary/10 ring-2 ring-inset ring-primary/50" />
                )}
                <TrackHeader
                  trackId={trackId}
                  index={virtualRow.index}
                  isDragging={isDragging}
                  isFocused={focusedTrackId === trackId}
                  isSelected={selectedTrackId === trackId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onTrackSelect={onTrackSelect}
                />
                {showDropIndicatorAfter && (
                  <div className="pointer-events-none absolute inset-0 rounded bg-primary/10 ring-2 ring-inset ring-primary/50" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
