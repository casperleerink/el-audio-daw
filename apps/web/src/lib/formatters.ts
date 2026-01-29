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
