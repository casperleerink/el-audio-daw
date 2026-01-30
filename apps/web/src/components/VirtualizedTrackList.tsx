import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical, Pencil, Plus, Trash2, VolumeX } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useTrackNameEdit } from "@/hooks/useTrackNameEdit";
import { useTrackReorder } from "@/hooks/useTrackReorder";
import { formatGain } from "@/lib/formatters";
import { TRACK_HEADER_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";

interface TrackData {
  _id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  gain: number;
}

interface TrackHeaderProps {
  track: TrackData;
  isDragging?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMuteChange: (muted: boolean) => void;
  onSoloChange: (solo: boolean) => void;
  /** Called on every gain change for real-time audio feedback */
  onGainChange: (gain: number) => void;
  /** Called when gain change is committed (slider released) for server sync */
  onGainCommit: (gain: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
}

function TrackHeader({
  track,
  isDragging,
  onDragStart,
  onDragEnd,
  onMuteChange,
  onSoloChange,
  onGainChange,
  onGainCommit,
  onNameChange,
  onDelete,
}: TrackHeaderProps) {
  const { isEditing, editName, inputRef, startEditing, setEditName, handleSubmit, handleKeyDown } =
    useTrackNameEdit({
      initialName: track.name,
      onNameChange,
    });

  // Local gain state for real-time slider feedback
  // Sync from server when not actively dragging
  const [localGain, setLocalGain] = useState(track.gain);
  const isDraggingGainRef = useRef(false);

  // Sync local gain from server state when not dragging
  useEffect(() => {
    if (!isDraggingGainRef.current) {
      setLocalGain(track.gain);
    }
  }, [track.gain]);

  const handleGainChange = useCallback(
    (value: number) => {
      isDraggingGainRef.current = true;
      setLocalGain(value);
      // Update audio engine immediately for real-time feedback
      onGainChange(value);
    },
    [onGainChange],
  );

  const handleGainCommit = useCallback(
    (value: number | readonly number[]) => {
      isDraggingGainRef.current = false;
      const gainValue = Array.isArray(value) ? (value[0] ?? 0) : value;
      // Only commit to server if value changed from original
      if (gainValue !== track.gain) {
        onGainCommit(gainValue);
      }
    },
    [onGainCommit, track.gain],
  );

  return (
    <div
      className={`box-border h-[60px] border-b p-2 transition-all duration-150 ${isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Track Name Row */}
      <div className="mb-1 flex items-center gap-1">
        <div
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-3" />
        </div>
        {isEditing ? (
          <div className="flex flex-1 items-center gap-1">
            <Input
              ref={inputRef}
              className="h-6 flex-1 border-ring text-xs ring-1 ring-ring/50"
              value={editName}
              maxLength={50}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
            />
            {editName.length >= 40 && (
              <span
                className={`shrink-0 text-[10px] ${editName.length >= 50 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {editName.length}/50
              </span>
            )}
          </div>
        ) : (
          <button
            className="group flex flex-1 items-center gap-1 truncate text-left text-xs font-medium hover:text-foreground/80"
            onClick={startEditing}
          >
            <span className="truncate">{track.name}</span>
            <Pencil className="size-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={track.muted}
          onPressedChange={onMuteChange}
          className="h-6 w-7 px-0 data-[state=on]:bg-yellow-500/20 data-[state=on]:text-yellow-600"
        >
          {track.muted ? (
            <VolumeX className="size-3" />
          ) : (
            <span className="text-[10px] font-semibold">M</span>
          )}
        </Toggle>
        <Toggle
          size="sm"
          pressed={track.solo}
          onPressedChange={onSoloChange}
          className="h-6 w-7 px-0 data-[state=on]:bg-green-500/20 data-[state=on]:text-green-600"
        >
          <span className="text-[10px] font-semibold">S</span>
        </Toggle>
        <Slider
          className="mx-1 flex-1"
          min={-60}
          max={12}
          step={0.1}
          value={[localGain]}
          onValueChange={(val) => handleGainChange(Array.isArray(val) ? (val[0] ?? 0) : val)}
          onValueCommit={handleGainCommit}
        />
        <span className="w-12 text-right font-mono text-[10px] text-muted-foreground">
          {formatGain(localGain)}
        </span>
      </div>
    </div>
  );
}

export interface VirtualizedTrackListProps {
  tracks: TrackData[];
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
  onMuteChange: (trackId: string, muted: boolean) => void;
  onSoloChange: (trackId: string, solo: boolean) => void;
  /** Called on every gain change for real-time audio feedback */
  onGainChange: (trackId: string, gain: number) => void;
  /** Called when gain change is committed (slider released) for server sync */
  onGainCommit: (trackId: string, gain: number) => void;
  onNameChange: (trackId: string, name: string) => void;
  onDelete: (trackId: string) => void;
  onReorder: (trackIds: string[]) => void;
  onAddTrack: () => void;
}

export const VirtualizedTrackList = React.forwardRef<HTMLDivElement, VirtualizedTrackListProps>(
  function VirtualizedTrackList(
    {
      tracks,
      scrollTop,
      onScrollChange,
      onMuteChange,
      onSoloChange,
      onGainChange,
      onGainCommit,
      onNameChange,
      onDelete,
      onReorder,
      onAddTrack,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Track reordering drag-drop logic
    const {
      draggedTrackId,
      dropTargetIndex,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDrop,
    } = useTrackReorder({ tracks, onReorder });

    // Sync scroll position from parent
    useEffect(() => {
      if (parentRef.current && Math.abs(parentRef.current.scrollTop - scrollTop) > 1) {
        parentRef.current.scrollTop = scrollTop;
      }
    }, [scrollTop]);

    const virtualizer = useVirtualizer({
      count: tracks.length,
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

    // Forward ref
    React.useImperativeHandle(ref, () => parentRef.current as HTMLDivElement, []);

    if (tracks.length === 0) {
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
            const track = tracks[virtualRow.index];
            if (!track) return null;

            const isDragging = track._id === draggedTrackId;
            const showDropIndicatorBefore = dropTargetIndex === virtualRow.index;
            const showDropIndicatorAfter =
              dropTargetIndex === virtualRow.index + 1 && virtualRow.index === tracks.length - 1;

            return (
              <div
                key={track._id}
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
                  track={track}
                  isDragging={isDragging}
                  onDragStart={(e) => handleDragStart(e, track._id)}
                  onDragEnd={handleDragEnd}
                  onMuteChange={(muted) => onMuteChange(track._id, muted)}
                  onSoloChange={(solo) => onSoloChange(track._id, solo)}
                  onGainChange={(gain) => onGainChange(track._id, gain)}
                  onGainCommit={(gain) => onGainCommit(track._id, gain)}
                  onNameChange={(name) => onNameChange(track._id, name)}
                  onDelete={() => onDelete(track._id)}
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
