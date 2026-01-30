import { useEffect, useRef } from "react";
import { useMeterSubscription } from "@/contexts/MeterContext";

interface TrackMeterProps {
  trackId: string;
  orientation?: "horizontal" | "vertical";
}

const SMOOTHING = 0.85; // Decay factor (higher = slower decay)
const MIN_DB = -60;

/**
 * Real-time audio level meter for a track.
 * Uses refs and direct DOM manipulation to avoid React re-renders,
 * ensuring smooth 60fps updates.
 */
export function TrackMeter({ trackId, orientation = "horizontal" }: TrackMeterProps) {
  const { subscribe } = useMeterSubscription();
  const meterLeftRef = useRef<HTMLDivElement>(null);
  const meterRightRef = useRef<HTMLDivElement>(null);

  // Smoothed display values for decay effect
  const displayLeftRef = useRef(0);
  const displayRightRef = useRef(0);

  useEffect(() => {
    const isVertical = orientation === "vertical";

    const unsubLeft = subscribe(`track-${trackId}-L`, (value) => {
      if (!meterLeftRef.current) return;

      // Convert to dB scale (0-1 range for display)
      const peakDb = 20 * Math.log10(Math.max(Math.abs(value.max), Math.abs(value.min), 0.0001));
      const normalized = Math.max(0, (peakDb - MIN_DB) / -MIN_DB);

      // Apply smoothing (hold peaks, decay smoothly)
      displayLeftRef.current = Math.max(normalized, displayLeftRef.current * SMOOTHING);

      // Use clipPath to reveal the gradient progressively
      if (isVertical) {
        // Vertical: clip from top, reveal from bottom
        const clipPercent = (1 - displayLeftRef.current) * 100;
        meterLeftRef.current.style.clipPath = `inset(${clipPercent}% 0 0 0)`;
      } else {
        // Horizontal: clip from right, reveal from left
        const clipPercent = (1 - displayLeftRef.current) * 100;
        meterLeftRef.current.style.clipPath = `inset(0 ${clipPercent}% 0 0)`;
      }
    });

    const unsubRight = subscribe(`track-${trackId}-R`, (value) => {
      if (!meterRightRef.current) return;

      const peakDb = 20 * Math.log10(Math.max(Math.abs(value.max), Math.abs(value.min), 0.0001));
      const normalized = Math.max(0, (peakDb - MIN_DB) / -MIN_DB);

      displayRightRef.current = Math.max(normalized, displayRightRef.current * SMOOTHING);

      if (isVertical) {
        const clipPercent = (1 - displayRightRef.current) * 100;
        meterRightRef.current.style.clipPath = `inset(${clipPercent}% 0 0 0)`;
      } else {
        const clipPercent = (1 - displayRightRef.current) * 100;
        meterRightRef.current.style.clipPath = `inset(0 ${clipPercent}% 0 0)`;
      }
    });

    return () => {
      unsubLeft();
      unsubRight();
    };
  }, [trackId, subscribe, orientation]);

  if (orientation === "vertical") {
    return (
      <div className="flex h-full gap-0.5">
        {/* Left channel */}
        <div className="relative w-2 rounded-sm bg-muted">
          <div
            ref={meterLeftRef}
            className="absolute inset-0 rounded-sm"
            style={{
              clipPath: "inset(100% 0 0 0)",
              background:
                "linear-gradient(to top, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)",
            }}
          />
        </div>
        {/* Right channel */}
        <div className="relative w-2 rounded-sm bg-muted">
          <div
            ref={meterRightRef}
            className="absolute inset-0 rounded-sm"
            style={{
              clipPath: "inset(100% 0 0 0)",
              background:
                "linear-gradient(to top, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-0.5 overflow-hidden rounded px-0.5">
      {/* Left channel */}
      <div className="relative h-1.5 rounded-sm bg-muted">
        <div
          ref={meterLeftRef}
          className="absolute inset-0 rounded-sm"
          style={{
            clipPath: "inset(0 100% 0 0)",
            background:
              "linear-gradient(to right, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)",
          }}
        />
      </div>
      {/* Right channel */}
      <div className="relative h-1.5 rounded-sm bg-muted">
        <div
          ref={meterRightRef}
          className="absolute inset-0 rounded-sm"
          style={{
            clipPath: "inset(0 100% 0 0)",
            background:
              "linear-gradient(to right, #22c55e 0%, #22c55e 70%, #eab308 85%, #ef4444 100%)",
          }}
        />
      </div>
    </div>
  );
}
