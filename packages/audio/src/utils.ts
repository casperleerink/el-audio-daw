/**
 * Converts decibels to linear gain.
 * @param dB - The decibel value (-60 to +12, or -Infinity for silence)
 * @returns Linear gain value (0 to ~4 for +12dB)
 */
export function dbToGain(dB: number): number {
  // Complete silence below -60dB
  if (dB <= -60) {
    return 0;
  }
  return Math.pow(10, dB / 20);
}

/**
 * Converts linear gain to decibels.
 * @param gain - Linear gain value
 * @returns Decibel value
 */
export function gainToDb(gain: number): number {
  if (gain <= 0) {
    return -Infinity;
  }
  return 20 * Math.log10(gain);
}

/**
 * Clamps a dB value to the valid range.
 * @param dB - The decibel value to clamp
 * @returns Clamped value between -60 and +12
 */
export function clampDb(dB: number): number {
  return Math.max(-60, Math.min(12, dB));
}
