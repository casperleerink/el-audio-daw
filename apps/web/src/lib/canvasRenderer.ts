/**
 * Pure canvas rendering functions for the timeline canvas.
 * Extracted from TimelineCanvas component to improve testability and readability.
 */

import { CLIP_BORDER_RADIUS, CLIP_PADDING } from "./timelineConstants";

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

export interface ClipRenderData {
  _id: string;
  trackId: string;
  name: string;
  startTime: number; // in samples
  duration: number; // in samples
}

export interface ClipDragState {
  clipId: string;
  currentStartTime: number;
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

interface DrawClipsOptions {
  renderCtx: TimelineRenderContext;
  clips: ClipRenderData[];
  trackIndexMap: Map<string, number>;
  sampleRate: number;
  clipDragState: ClipDragState | null;
}

/**
 * Draw all clips on the timeline
 */
export function drawClips(options: DrawClipsOptions): void {
  const { renderCtx, clips, trackIndexMap, sampleRate, clipDragState } = options;
  const { ctx, width, height, scrollLeft, scrollTop, pixelsPerSecond, rulerHeight, trackHeight } =
    renderCtx;

  // Calculate visible time range
  const startTime = scrollLeft / pixelsPerSecond;
  const visibleDuration = width / pixelsPerSecond;
  const endTime = startTime + visibleDuration;

  for (const clip of clips) {
    const trackIndex = trackIndexMap.get(clip.trackId);
    if (trackIndex === undefined) continue;

    // Check if clip is being dragged
    const isDragging = clipDragState?.clipId === clip._id;

    // Use drag position if dragging, otherwise original position
    const effectiveStartTime = isDragging ? clipDragState.currentStartTime : clip.startTime;

    // Convert clip times from samples to seconds
    const clipStartSeconds = effectiveStartTime / sampleRate;
    const clipDurationSeconds = clip.duration / sampleRate;
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
    ctx.globalAlpha = isDragging ? 0.5 : 0.7;
    ctx.beginPath();
    ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
    ctx.fill();

    // Draw clip border
    ctx.strokeStyle = trackColor;
    ctx.globalAlpha = isDragging ? 0.7 : 1;
    ctx.lineWidth = isDragging ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(clipX, clipY, clipWidth, clipHeight, CLIP_BORDER_RADIUS);
    ctx.stroke();

    // Draw clip name
    if (clipWidth > 30) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = isDragging ? 0.6 : 0.9;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const textPadding = 6;
      const maxTextWidth = clipWidth - textPadding * 2;
      let displayName = clip.name;

      // Truncate with ellipsis if needed
      let textWidth = ctx.measureText(displayName).width;
      if (textWidth > maxTextWidth) {
        while (textWidth > maxTextWidth && displayName.length > 0) {
          displayName = displayName.slice(0, -1);
          textWidth = ctx.measureText(displayName + "…").width;
        }
        displayName = displayName + "…";
      }

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
  rulerHeight: number;
  trackHeight: number;
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
    rulerHeight,
    trackHeight,
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

  // Render in order: background, ruler, tracks, clips, playhead, hover
  clearCanvas({ ctx, width: dimensions.width, height: dimensions.height, colors });
  drawTimeRuler(renderCtx);
  drawTrackLanes(renderCtx, tracks.length);
  drawClips({
    renderCtx,
    clips,
    trackIndexMap,
    sampleRate,
    clipDragState,
  });
  drawPlayhead(renderCtx, playheadTime);
  drawHoverIndicator(renderCtx, hoverX);
}
