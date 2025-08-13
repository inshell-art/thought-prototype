// UpscaleHelper.ts
export function UpscaledCanvas(
    wfcOutput: Uint8ClampedArray,
    cols: number,
    rows: number,
    upscalingWidth: number,
    upscalingHeight: number,
    pixelated: boolean
): HTMLCanvasElement {

    // 1) small offscreen canvas
    const smallCanvas = document.createElement('canvas');

    smallCanvas.width = cols;
    smallCanvas.height = rows;
    const sCtx = smallCanvas.getContext('2d');
    if (!sCtx) throw new Error('Cannot get 2D context on smallCanvas');
    sCtx.imageSmoothingEnabled = !pixelated;
    // Put wfcOutput into smallCanvas
    const imageData = sCtx.createImageData(cols, rows);
    for (let i = 0; i < wfcOutput.length; i++) {
        imageData.data[i] = wfcOutput[i];

        sCtx.putImageData(imageData, 0, 0);
    }


    // 2) bigCanvas
    const bigCanvas = document.createElement('canvas');
    bigCanvas.width = upscalingWidth
    bigCanvas.height = upscalingHeight;
    const bCtx = bigCanvas.getContext('2d');
    if (!bCtx) throw new Error('Cannot get 2D context on bigCanvas');

    bCtx.imageSmoothingEnabled = !pixelated;
    bCtx.imageSmoothingQuality = 'high';

    // 3) scale up
    bCtx.drawImage(
        smallCanvas,
        0, 0, cols, rows,
        0, 0, upscalingWidth, upscalingHeight
    );

    return bigCanvas;
}
