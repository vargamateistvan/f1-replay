import type { Map as MapboxMap } from "mapbox-gl";

/**
 * Download the 3D map as a PNG. WebGL clears its drawing buffer after each
 * frame, so the canvas is read inside a `render` callback (same frame) rather
 * than paying for `preserveDrawingBuffer` on every frame.
 */
export function exportMapSnapshot(map: MapboxMap): void {
  map.once("render", () => {
    map.getCanvas().toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "f1-replay-3d.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
    }, "image/png");
  });
  map.triggerRepaint();
}
