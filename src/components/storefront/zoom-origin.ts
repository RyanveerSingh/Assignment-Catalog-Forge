/** Where a hover zoom should anchor, as percentages of the frame, so the part under the cursor stays put when the photo scales. */
export function zoomOrigin(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return { x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(y * 10) / 10)) };
}
