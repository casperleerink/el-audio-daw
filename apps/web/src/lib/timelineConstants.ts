/**
 * Centralized constants for the timeline canvas.
 * These values are used across both the TimelineCanvas component and canvasRenderer.
 */

/** Height of each track lane in pixels */
export const TRACK_HEIGHT = 60;

/** Height of the track header in the sidebar (matches track lane height for alignment) */
export const TRACK_HEADER_HEIGHT = 60;

/** Height of the time ruler at the top in pixels */
export const RULER_HEIGHT = 24;

/** Padding inside clips from the track lane borders */
export const CLIP_PADDING = 2;

/** Border radius for clip rectangles */
export const CLIP_BORDER_RADIUS = 4;

/** Default zoom level (pixels per second) */
export const DEFAULT_PIXELS_PER_SECOND = 20;

/** Minimum zoom level (pixels per second) - zoomed out */
export const MIN_PIXELS_PER_SECOND = 2;

/** Maximum zoom level (pixels per second) - zoomed in */
export const MAX_PIXELS_PER_SECOND = 200;
