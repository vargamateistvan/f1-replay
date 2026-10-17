/**
 * Whether the 3D map can run here. Kept free of mapbox-gl imports so the
 * check stays out of the lazily-loaded map chunk.
 */

export function mapboxToken(): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  return token ? token : null;
}

let webgl2: boolean | null = null;

export function supportsWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    const canvas = document.createElement("canvas");
    webgl2 = canvas.getContext("webgl2") != null;
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

/** Token configured and WebGL2 available. */
export function isMap3dAvailable(): boolean {
  return mapboxToken() !== null && supportsWebGL2();
}
