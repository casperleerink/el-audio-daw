/**
 * Pure canvas rendering functions for the timeline canvas.
 * Extracted from TimelineCanvas component to improve testability and readability.
 */

import { CLIP_BORDER_RADIUS, CLIP_PADDING, TRIM_HANDLE_WIDTH } from "./timelineConstants";

export interface CanvasColors {
  background: string;
  border: string;
  muted: string;
}

export interface TimelineRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  colors: CanvasColors;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  rulerHeight: number;
  trackHeight: number;
}

/** Which zone of a clip is being hovered (FR-14) */
export type ClipHoverZone = "left" | "right" | "body";

export interface ClipRenderData {
  _id: string;
  trackId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
  pending?: boolean; // true if clip is awaiting server confirmation
  selected?: boolean; // true if clip is selected (FR-7)
  hoverZone?: ClipHoverZone | null; // which part of clip is hovered (FR-14)
}

export interface ClipDragState {
  clipId: string;
  currentStartTime: number;
  currentTrackId: string; // Target track during cross-track drag (FR-31)
}

export interface TrimDragState {
  clipId: string;
  currentStartTime: number;
  currentDuration: number;
}

/**
 * Get CSS color values from computed styles with fallbacks
 */
export function getCanvasColors(): CanvasColors {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue("--background").trim() || "#09090b",
    border: styles.getPropertyValue("--border").trim() || "#27272a",
    muted: styles.getPropertyValue("--muted-foreground").trim() || "#71717a",
  };
}

/**
 * Generate a track color from its index using golden angle for even distribution
 */
export function getTrackColor(index: number): string {
  const goldenAngle = 137.508;
  const hue = (index * goldenAngle) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Truncate text to fit within a given width, adding an ellipsis if needed.
 * Returns the truncated text that fits within maxWidth.
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  let textWidth = ctx.measureText(text).width;
  if (textWidth <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (textWidth > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
    textWidth = ctx.measureText(truncated + "…").width;
  }
  return truncated + "…";
}

/**
 * Clear the canvas with background color
 */
export function clearCanvas(ctx: CanvasRenderContext): void {
  const { ctx: context, width, height, colors } = ctx;
  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
}

interface CanvasRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  colors: CanvasColors;
}

/**
 * Draw the time ruler with markers and labels
 */
export function drawTimeRuler(renderCtx: TimelineRenderContext): void {
  const { ctx, width, colors, scrollLeft, pixelsPerSecond, rulerHeight } = renderCtx;

  // Draw ruler bottom border
  ctx.fillStyle = colors.border;
  ctx.fillRect(0, rulerHeight - 1, width, 1);

  // Calculate visible time range
  const startTime = scrollLeft / pixelsPerSecond;
  const visibleDuration = width / pixelsPerSecond;
  const endTime = startTime + visibleDuration;

  // Calculate marker interval based on zoom level
  let markerInterval = 1; // seconds
  const minPixelsBetweenMarkers = 60;
  while (markerInterval * pixelsPerSecond < minPixelsBetweenMarkers) {
    markerInterval *= 2;
  }

  // Draw time markers
  ctx.fillStyle = colors.muted;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";

  const firstMarker = Math.floor(startTime / markerInterval) * markerInterval;
  for (let time = firstMarker; time <= endTime; time += markerInterval) {
    const x = (time - startTime) * pixelsPerSecond;
    if (x < 0) continue;

    // Draw tick
    ctx.fillRect(x, rulerHeight - 8, 1, 8);

    // Draw time label
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, x, 12);
  }
}

/**
 * Draw track lane separator lines
 */
export function drawTrackLanes(renderCtx: TimelineRenderContext, trackCount: number): void {
  const { ctx, width, height, colors, scrollTop, rulerHeight, trackHeight } = renderCtx;

  for (let i = 0; i < trackCount; i++) {
    const y = rulerHeight + i * trackHeight - scrollTop;
    // Skip tracks outside visible area
    if (y + trackHeight < rulerHeight || y > height) continue;
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, y + trackHeight - 1, width, 1);
  }
}

/**
 * Draw target track highlight during cross-track drag (FR-33)
 */
export function drawTargetTrackHighlight(
  renderCtx: TimelineRenderContext,
  clipDragState: ClipDragState | null,
  trackIndexMap: Map<string, number>,
  originalTrackId: string | null,
): void {
  if (!clipDragState || !originalTrackId) return;

  // Only show highlight if dragging to a different track
  if (clipDragState.currentTrackId === originalTrackId) return;

  const targetTrackIndex = trackIndexMap.get(clipDragState.currentTrackId);
  if (targetTrackIndex === undefined) return;

  const { ctx, width, scrollTop, rulerHeight, trackHeight } = renderCtx;

  const trackY = rulerHeight + targetTrackIndex * trackHeight - scrollTop;

  // Draw subtle highlight on target track
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.08;
  ctx.fillRect(0, trackY, width, trackHeight);
  ctx.restore();
}

interface DrawClipsOptions {
  renderCtx: TimelineRenderContext;
  clips: ClipRenderData[];
  trackIndexMap: Map<string, number>;
  sampleRate: number;
  clipDragState: ClipDragState | null;
  trimDragState: TrimDragState | null;
}

/**
 * Create a diagonal stripe pattern for pending clips
 */
function createPendingPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const patternCanvas = document.createElement("canvas");
  const patternSize = 8;
  patternCanvas.width = patternSize;
  patternCanvas.height = patternSize;
  const patternCtx = patternCanvas.getContext("2d");
  if (!patternCtx) return null;

  // Transparent background
  patternCtx.clearRect(0, 0, patternSize, patternSize);

  // Draw diagonal stripe
  patternCtx.strokeStyle = color;
  patternCtx.lineWidth = 2;
  patternCtx.beginPath();
  patternCtx.moveTo(0, patternSize);
  patternCtx.lineTo(patternSize, 0);
  patternCtx.stroke();

  return ctx.createPattern(patternCanvas, "repeat");
}

/**
 * Draw all clips on the timeline
 */
export function drawClips(options: DrawClipsOptions): void {
  const { renderCtx, clips, trackIndexMap, sampleRate, clipDragState, trimDragState } = options;
  const { ctx, width, height, scrollLeft, scrollTop, pixelsPerSecond, rulerHeight, trackHeight } =
    renderCtx;

  // Calculate visible time range
  const startTime = scrollLeft / pixelsPerSecond;
  const visibleDuration = width / pixelsPerSecond;
  const endTime = startTime + visibleDuration;

  for (const clip of clips) {
    let trackIndex = trackIndexMap.get(clip.trackId);
    if (trackIndex === undefined) continue;

    // Check if clip is being dragged, trimmed, pending, or selected
    const isDragging = clipDragState?.clipId === clip._id;
    const isTrimming = trimDragState?.clipId === clip._id;
    const isPending = clip.pending === true;
    const isSelected = clip.selected === true;

    // Use drag/trim position if active, otherwise original position
    let effectiveStartTime = clip.startTime;
    let effectiveDuration = clip.duration;

    if (isDragging) {
      effectiveStartTime = clipDragState.currentStartTime;
      // Use target track for rendering during cross-track drag (FR-33)
      const targetTrackIndex = trackIndexMap.get(clipDragState.currentTrackId);
      if (targetTrackIndex !== undefined) {
        trackIndex = targetTrackIndex;
      }
    } else if (isTrimming) {
      effectiveStartTime = trimDragState.currentStartTime;
      effectiveDuration = trimDragState.currentDuration;
    }

    // Convert clip times from samples to seconds
    const clipStartSeconds = effectiveStartTime / sampleRate;
    const clipDurationSeconds = effectiveDuration / sampleRate;
    const clipEndSeconds = clipStartSeconds + clipDurationSeconds;

    // Skip clips outside visible time range
    if (clipEndSeconds < startTime || clipStartSeconds > endTime) continue;

    // Calculate clip rectangle
    const clipX = (clipStartSeconds - startTime) * pixelsPerSecond;
    const clipWidth = clipDurationSeconds * pixelsPerSecond;
    const trackY = rulerHeight + trackIndex * trackHeight - scrollTop;

    // Skip clips in tracks outside visible area
    if (trackY + trackHeight < rulerHeight || trackY > height) continue;

    const clipY = trackY + CLIP_PADDING;
    const clipHeight = trackHeight - CLIP_PADDING * 2 - 1;

    // Get track color
    const trackColor = getTrackColor(trackIndex);

    // Draw clip background
    ctx.fillStyle = trackColor;
    // Pending clips have lower opacity, dragging clips even lower
    ctx.globalAlpha = isPending ? 0.4 : isDragging ? 0.5 : 0.7;
    ctx.beginPath();
    ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
    ctx.fill();

    // Draw stripe pattern overlay for pending clips
    if (isPending) {
      const pattern = createPendingPattern(ctx, "rgba(255, 255, 255, 0.15)");
      if (pattern) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
        ctx.clip();
        ctx.fillStyle = pattern;
        ctx.fillRect(clipX, clipY, clipWidth, clipHeight);
        ctx.restore();
      }
    }

    // Draw clip border (dashed for pending, bright for selected)
    // FR-7: Selected clips display distinct border color
    ctx.strokeStyle = isSelected ? "#ffffff" : trackColor;
    ctx.globalAlpha = isPending ? 0.6 : isDragging ? 0.7 : 1;
    ctx.lineWidth = isSelected ? 2 : isDragging ? 2 : 1;
    if (isPending) {
      ctx.setLineDash([4, 4]);
    }
    ctx.beginPath();
    ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
    ctx.stroke();
    if (isPending) {
      ctx.setLineDash([]);
    }

    // Draw selection glow for selected clips (FR-7)
    if (isSelected && !isPending) {
      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
      ctx.stroke();
      ctx.restore();
    }

    // FR-14: Draw trim handles when clip is hovered (not pending, not dragging)
    const hoverZone = clip.hoverZone;
    if (hoverZone && !isPending && !isDragging && clipWidth >= TRIM_HANDLE_WIDTH * 2) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ffffff";

      // Draw the hovered handle with highlight
      if (hoverZone === "left" || hoverZone === "body") {
        // Left handle
        const leftHandleAlpha = hoverZone === "left" ? 0.5 : 0.2;
        ctx.globalAlpha = leftHandleAlpha;
        ctx.beginPath();
        ctx.roundRect(clipX, clipY, TRIM_HANDLE_WIDTH, clipHeight, [
          CLIP_BORDER_RADIUS,
          0,
          0,
          CLIP_BORDER_RADIUS,
        ]);
        ctx.fill();
      }

      if (hoverZone === "right" || hoverZone === "body") {
        // Right handle
        const rightHandleAlpha = hoverZone === "right" ? 0.5 : 0.2;
        ctx.globalAlpha = rightHandleAlpha;
        ctx.beginPath();
        ctx.roundRect(clipX + clipWidth - TRIM_HANDLE_WIDTH, clipY, TRIM_HANDLE_WIDTH, clipHeight, [
          0,
          CLIP_BORDER_RADIUS,
          CLIP_BORDER_RADIUS,
          0,
        ]);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw clip name
    if (clipWidth > 30) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = isPending ? 0.5 : isDragging ? 0.6 : 0.9;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const textPadding = 6;
      const maxTextWidth = clipWidth - textPadding * 2;
      const displayName = truncateText(ctx, clip.name, maxTextWidth);

      ctx.fillText(displayName, clipX + textPadding, clipY + clipHeight / 2);
    }

    ctx.globalAlpha = 1;
  }
}

/**
 * Draw the playhead indicator line
 */
export function drawPlayhead(renderCtx: TimelineRenderContext, playheadTime: number): void {
  const { ctx, width, height, colors, scrollLeft, pixelsPerSecond } = renderCtx;

  const startTime = scrollLeft / pixelsPerSecond;
  const playheadX = (playheadTime - startTime) * pixelsPerSecond;

  if (playheadX >= 0 && playheadX <= width) {
    ctx.fillStyle = colors.muted;
    ctx.fillRect(playheadX, 0, 1, height);
  }
}

/**
 * Draw the hover indicator dashed line
 */
export function drawHoverIndicator(renderCtx: TimelineRenderContext, hoverX: number | null): void {
  if (hoverX === null) return;

  const { ctx, width, height, colors } = renderCtx;

  if (hoverX >= 0 && hoverX <= width) {
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hoverX, 0);
    ctx.lineTo(hoverX, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

interface RenderTimelineOptions {
  canvas: HTMLCanvasElement;
  dimensions: { width: number; height: number };
  tracks: { _id: string }[];
  clips: ClipRenderData[];
  sampleRate: number;
  playheadTime: number;
  scrollLeft: number;
  scrollTop: number;
  pixelsPerSecond: number;
  hoverX: number | null;
  clipDragState: ClipDragState | null;
  trimDragState: TrimDragState | null;
  rulerHeight: number;
  trackHeight: number;
  /** Original track ID of dragging clip (for target track highlight) */
  dragOriginalTrackId?: string | null;
}

/**
 * Main render function that orchestrates all canvas drawing
 */
export function renderTimeline(options: RenderTimelineOptions): void {
  const {
    canvas,
    dimensions,
    tracks,
    clips,
    sampleRate,
    playheadTime,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    hoverX,
    clipDragState,
    trimDragState,
    rulerHeight,
    trackHeight,
    dragOriginalTrackId,
  } = options;

  const ctx = canvas.getContext("2d");
  if (!ctx || dimensions.width === 0) return;

  // Set up high-DPI canvas
  const dpr = window.devicePixelRatio || 1;
  canvas.width = dimensions.width * dpr;
  canvas.height = dimensions.height * dpr;
  ctx.scale(dpr, dpr);

  const colors = getCanvasColors();

  const renderCtx: TimelineRenderContext = {
    ctx,
    width: dimensions.width,
    height: dimensions.height,
    colors,
    scrollLeft,
    scrollTop,
    pixelsPerSecond,
    rulerHeight,
    trackHeight,
  };

  // Build track index map
  const trackIndexMap = new Map<string, number>();
  tracks.forEach((track, index) => {
    trackIndexMap.set(track._id, index);
  });

  // Render in order: background, ruler, tracks, target highlight, clips, playhead, hover
  clearCanvas({ ctx, width: dimensions.width, height: dimensions.height, colors });
  drawTimeRuler(renderCtx);
  drawTrackLanes(renderCtx, tracks.length);
  // Draw target track highlight during cross-track drag (FR-33)
  drawTargetTrackHighlight(renderCtx, clipDragState, trackIndexMap, dragOriginalTrackId ?? null);
  drawClips({
    renderCtx,
    clips,
    trackIndexMap,
    sampleRate,
    clipDragState,
    trimDragState,
  });
  drawPlayhead(renderCtx, playheadTime);
  drawHoverIndicator(renderCtx, hoverX);
}
