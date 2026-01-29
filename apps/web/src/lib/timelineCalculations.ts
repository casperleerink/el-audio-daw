/**
 * Pure utility functions for timeline coordinate calculations.
 * These convert between screen coordinates and timeline positions (track index, time).
 */

interface TimelineLayoutParams {
  rulerHeight: number;
  trackHeight: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
}

interface CanvasPosition {
  canvasX: number;
  canvasY: number;
}

/**
 * Converts client (screen) coordinates to canvas-relative coordinates.
 */
export function clientToCanvasPosition(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
): CanvasPosition {
  return {
    canvasX: clientX - canvasRect.left,
    canvasY: clientY - canvasRect.top,
  };
}

/**
 * Checks if a canvas Y coordinate is within the track area (below the ruler).
 */
export function isInTrackArea(canvasY: number, rulerHeight: number): boolean {
  return canvasY >= rulerHeight;
}

/**
 * Calculates the track index from a canvas Y coordinate.
 * Returns -1 if the position is above the tracks (in the ruler area).
 */
export function calculateTrackIndexFromY(
  canvasY: number,
  params: Pick<TimelineLayoutParams, "rulerHeight" | "trackHeight" | "scrollTop">,
): number {
  if (!isInTrackArea(canvasY, params.rulerHeight)) {
    return -1;
  }
  return Math.floor((canvasY - params.rulerHeight + params.scrollTop) / params.trackHeight);
}

/**
 * Calculates the time in seconds from a canvas X coordinate.
 */
export function calculateTimeFromX(
  canvasX: number,
  params: Pick<TimelineLayoutParams, "scrollLeft" | "pixelsPerSecond">,
): number {
  return (canvasX + params.scrollLeft) / params.pixelsPerSecond;
}

/**
 * Converts time in seconds to samples.
 */
export function secondsToSamples(timeInSeconds: number, sampleRate: number): number {
  return Math.round(timeInSeconds * sampleRate);
}

/**
 * Converts samples to time in seconds.
 */
export function samplesToSeconds(samples: number, sampleRate: number): number {
  return samples / sampleRate;
}
