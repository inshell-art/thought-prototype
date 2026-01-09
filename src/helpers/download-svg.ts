function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function parseSVG(svgString: string): SVGSVGElement {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const svg = doc.documentElement as unknown as SVGSVGElement;

    // Ensure namespaces
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!svg.getAttribute("xmlns:xlink")) svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    return svg;
}

function getSvgSize(svg: SVGSVGElement): { width: number; height: number } {
    // Prefer explicit width/height; fallback to viewBox
    const wAttr = svg.getAttribute("width");
    const hAttr = svg.getAttribute("height");
    if (wAttr && hAttr) {
        return { width: Number(wAttr), height: Number(hAttr) };
    }
    const vb = svg.getAttribute("viewBox");
    if (vb) {
        const [, , w, h] = vb.split(/\s+/).map(Number);
        return { width: w, height: h };
    }
    // Fallback
    return { width: 1024, height: 1024 };
}

export function DownloadSVG(svgCode: string, filename = "thought.svg") {
    const svg = parseSVG(svgCode);
    // Optional: lock explicit pixel size from viewBox to avoid scaling surprises
    const { width, height } = getSvgSize(svg);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));

    const serialized = new XMLSerializer().serializeToString(svg);
    downloadBlob(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }), filename);
}
