/**
 * Format time as M:SS.mmm
 * @param seconds - Time in seconds
 * @param msPrecision - Number of millisecond digits (default: 3)
 */
export function formatTime(seconds: number, msPrecision: 2 | 3 = 3): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const divisor = msPrecision === 2 ? 100 : 1000;
  const ms = Math.floor((seconds % 1) * divisor);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(msPrecision, "0")}`;
}

/**
 * Format gain as dB
 * @param db - Gain in decibels
 */
export function formatGain(db: number): string {
  if (db <= -60) return "-∞";
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

/**
 * Format a timestamp as a localized date string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string (e.g., "Jan 15" or "Jan 15, 2024" for dates in other years)
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Format pan value for display
 * @param pan - Pan value from -1 (full left) to 1 (full right)
 * @returns Formatted pan string (e.g., "C", "L", "R", "25L", "50R")
 */
export function formatPan(pan: number): string {
  if (!Number.isFinite(pan)) return "C";
  if (Math.abs(pan) < 0.01) return "C";
  if (pan <= -0.99) return "L";
  if (pan >= 0.99) return "R";
  const pct = Math.round(Math.abs(pan) * 50);
  return pan < 0 ? `${pct}L` : `${pct}R`;
}
