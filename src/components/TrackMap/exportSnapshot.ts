import { TRACK_SVG_W as SVG_W, TRACK_SVG_H as SVG_H } from "@/constants";

// Serialize the live SVG to a hi-DPI PNG and trigger a browser download.
// Uses XMLSerializer → Image → Canvas pipeline — no extra dependencies.
export function exportTrackSnapshot(svgEl: SVGSVGElement): void {
  const w = svgEl.clientWidth || SVG_W;
  const h = svgEl.clientHeight || SVG_H;
  const dpr = window.devicePixelRatio || 1;
  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.scale(dpr, dpr);
    // Fill background so the PNG isn't transparent where the SVG bg is set via CSS.
    ctx.fillStyle = "#15151e";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pngBlob);
      a.download = "f1-replay.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
