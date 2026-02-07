/**
 * Generate a track color from its index using golden angle for even distribution.
 */
export function getTrackColor(index: number): string {
  const goldenAngle = 137.508;
  const hue = (index * goldenAngle) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Get CSS color values from computed styles with fallbacks.
 */
export function getCanvasColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue("--background").trim() || "#09090b",
    border: styles.getPropertyValue("--border").trim() || "#27272a",
    muted: styles.getPropertyValue("--muted-foreground").trim() || "#71717a",
  };
}
