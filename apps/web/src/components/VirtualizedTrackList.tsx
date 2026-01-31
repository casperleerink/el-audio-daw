import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical, Pencil, Plus, Trash2, VolumeX } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useOptimisticControl } from "@/hooks/useOptimisticControl";
import { useTrackNameEdit } from "@/hooks/useTrackNameEdit";
import { useTrackReorder } from "@/hooks/useTrackReorder";
import { getTrackColor } from "@/lib/canvasRenderer";
import { formatGain } from "@/lib/formatters";
import { TRACK_HEADER_HEIGHT } from "@/lib/timelineConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Knob } from "@/components/ui/knob";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { TrackMeter } from "@/components/TrackMeter";

interface TrackData {
  _id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  gain: number;
  pan?: number;
}

interface TrackHeaderProps {
  track: TrackData;
  index: number;
  isDragging?: boolean;
  isFocused?: boolean; // FR-9: Track has clip selection focus
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMuteChange: (muted: boolean) => void;
  onSoloChange: (solo: boolean) => void;
  /** Called on every gain change for real-time audio feedback */
  onGainChange: (gain: number) => void;
  /** Called when gain change is committed (slider released) for server sync */
  onGainCommit: (gain: number) => void;
  /** Called on every pan change for real-time audio feedback */
  onPanChange: (pan: number) => void;
  /** Called when pan change is committed (knob released) for server sync */
  onPanCommit: (pan: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
}

function TrackHeader({
  track,
  index,
  isDragging,
  isFocused,
  onDragStart,
  onDragEnd,
  onMuteChange,
  onSoloChange,
  onGainChange,
  onGainCommit,
  onPanChange,
  onPanCommit,
  onNameChange,
  onDelete,
}: TrackHeaderProps) {
  const trackColor = getTrackColor(index);
  const { isEditing, editName, inputRef, startEditing, setEditName, handleSubmit, handleKeyDown } =
    useTrackNameEdit({
      initialName: track.name,
      onNameChange,
    });

  // Gain control with optimistic updates
  const {
    localValue: localGain,
    handleChange: handleGainChange,
    handleCommit: handleGainCommitRaw,
  } = useOptimisticControl({
    serverValue: track.gain,
    onChange: onGainChange,
    onCommit: onGainCommit,
  });

  // Pan control with optimistic updates
  const {
    localValue: localPan,
    handleChange: handlePanChange,
    handleCommit: handlePanCommit,
  } = useOptimisticControl({
    serverValue: track.pan ?? 0,
    onChange: onPanChange,
    onCommit: onPanCommit,
  });

  // Wrapper to handle slider's array value format
  const handleGainCommit = useCallback(
    (value: number | readonly number[]) => {
      const gainValue = Array.isArray(value) ? (value[0] ?? 0) : value;
      handleGainCommitRaw(gainValue);
    },
    [handleGainCommitRaw],
  );

  // Only enable dragging when grip handle is being used
  const [isDragHandleActive, setIsDragHandleActive] = useState(false);

  // Format pan value for display
  const formatPan = (pan: number) => {
    if (!Number.isFinite(pan)) return "C";
    if (Math.abs(pan) < 0.01) return "C";
    if (pan <= -0.99) return "L";
    if (pan >= 0.99) return "R";
    const pct = Math.round(Math.abs(pan) * 50);
    return pan < 0 ? `${pct}L` : `${pct}R`;
  };

  return (
    <div
      className={`box-border flex h-[100px] border-b transition-all duration-150 ${isDragging ? "scale-[0.98] opacity-50 shadow-lg ring-2 ring-primary/30" : ""}`}
      draggable={isDragHandleActive}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setIsDragHandleActive(false);
        onDragEnd();
      }}
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
              className="group flex flex-1 items-center gap-1 truncate text-left text-sm font-medium hover:text-foreground/80"
              onClick={startEditing}
            >
              <span className="truncate">{track.name}</span>
              <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {/* Row 2: M/S buttons, pan control - at bottom */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Toggle
              size="sm"
              pressed={track.muted}
              onPressedChange={onMuteChange}
              className="h-7 w-7 bg-muted/50 px-0 hover:bg-muted data-[state=on]:bg-yellow-500 data-[state=on]:text-yellow-950 data-[state=on]:hover:bg-yellow-400"
            >
              {track.muted ? (
                <VolumeX className="size-3.5" />
              ) : (
                <span className="text-xs font-semibold">M</span>
              )}
            </Toggle>
            <Toggle
              size="sm"
              pressed={track.solo}
              onPressedChange={onSoloChange}
              className="h-7 w-7 bg-muted/50 px-0 hover:bg-muted data-[state=on]:bg-green-500 data-[state=on]:text-green-950 data-[state=on]:hover:bg-green-400"
            >
              <span className="text-xs font-semibold">S</span>
            </Toggle>
          </div>
          <div className="flex items-center gap-1.5">
            <Knob
              value={localPan}
              min={-1}
              max={1}
              step={0.02}
              size={26}
              onChange={handlePanChange}
              onCommit={handlePanCommit}
            />
            <span className="w-6 text-center font-mono text-[10px] text-muted-foreground">
              {formatPan(localPan)}
            </span>
          </div>
        </div>
      </div>

      {/* Right section: Vertical meter with integrated fader */}
      <div className="flex w-[60px] shrink-0 flex-col items-center justify-between border-l border-border/50 px-1.5 py-1.5">
        <div className="relative flex flex-1 items-center justify-center">
          {/* Meter bars as visual track */}
          <TrackMeter trackId={track._id} orientation="vertical" />
          {/* Slider overlaid on meter - transparent track, only thumb visible */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Slider
              orientation="vertical"
              min={-60}
              max={12}
              step={0.1}
              value={[localGain]}
              transparentTrack
              onValueChange={(val) => handleGainChange(Array.isArray(val) ? (val[0] ?? 0) : val)}
              onValueCommit={handleGainCommit}
            />
          </div>
        </div>
        <span className="mt-1 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
          {formatGain(localGain)}
        </span>
      </div>
    </div>
  );
}

export interface VirtualizedTrackListProps {
  tracks: TrackData[];
  scrollTop: number;
  focusedTrackId?: string | null; // FR-9: Currently focused track for selection
  onScrollChange: (scrollTop: number) => void;
  onMuteChange: (trackId: string, muted: boolean) => void;
  onSoloChange: (trackId: string, solo: boolean) => void;
  /** Called on every gain change for real-time audio feedback */
  onGainChange: (trackId: string, gain: number) => void;
  /** Called when gain change is committed (slider released) for server sync */
  onGainCommit: (trackId: string, gain: number) => void;
  /** Called on every pan change for real-time audio feedback */
  onPanChange: (trackId: string, pan: number) => void;
  /** Called when pan change is committed (knob released) for server sync */
  onPanCommit: (trackId: string, pan: number) => void;
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
      focusedTrackId,
      onScrollChange,
      onMuteChange,
      onSoloChange,
      onGainChange,
      onGainCommit,
      onPanChange,
      onPanCommit,
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
                  index={virtualRow.index}
                  isDragging={isDragging}
                  isFocused={focusedTrackId === track._id}
                  onDragStart={(e) => handleDragStart(e, track._id)}
                  onDragEnd={handleDragEnd}
                  onMuteChange={(muted) => onMuteChange(track._id, muted)}
                  onSoloChange={(solo) => onSoloChange(track._id, solo)}
                  onGainChange={(gain) => onGainChange(track._id, gain)}
                  onGainCommit={(gain) => onGainCommit(track._id, gain)}
                  onPanChange={(pan) => onPanChange(track._id, pan)}
                  onPanCommit={(pan) => onPanCommit(track._id, pan)}
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
