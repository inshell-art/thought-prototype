import React, { useRef, useEffect } from 'react';

type SquareProps = {
    index: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
    entireCanvas: HTMLCanvasElement | null;
    entropy: number;
};

const SquareImpl: React.FC<SquareProps> = ({ index, cols, rows, width, height, entireCanvas, entropy }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const size = width / cols;
    const col = index % cols;
    const row = Math.floor(index / rows);
    useEffect(() => {
        const squareCanvas = canvasRef.current?.getContext('2d');
        if (!squareCanvas) return;
        if (!entireCanvas) {
            squareCanvas.clearRect(0, 0, size, size);
            return;
        }
        const srcX = col * size;
        const srcY = row * size;
        const srcW = size;
        const srcH = size;

        squareCanvas.globalCompositeOperation = 'darken';
        // squareCanvas.globalCompositeOperation = 'lighten';
        // squareCanvas.globalCompositeOperation = 'overlay';
        // squareCanvas.globalCompositeOperation = 'difference';
        // squareCanvas.globalCompositeOperation = 'hard-light'//'hue', 'saturation', 'color', 'luminosity', color-dodge, color-burn, hard-light, soft-light, difference, exclusion, overlay, darken, lighten, screen, multiply, source-over, destination-over, source-in, destination-in, source-out, destination-out, source-atop, destination-atop, xor, copy;
        //Multiply: Good for darkening or simulating paint layering.
        //Screen: Good for brightening or simulating light - based overlap.
        //Overlay: A mix of multiply / screen for stronger contrast.
        //Darken / Lighten: Keep only the darker / lighter parts of the new or old layer.
        //Difference / Exclusion: Colorful, inverted effects for creative visuals.
        squareCanvas.drawImage(
            entireCanvas,
            srcX, srcY, srcW, srcH,
            0, 0, size, size
        );
    }, [entropy]);

    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            // style={{ border: 'px solidrgba(0, 0, 0, 0)' }}
            style={{
                border: '1px solid transparent', // no border
                backgroundColor: 'transparent'
            }}
        />
    );
};
const arePropsEqual = (prev: SquareProps, next: SquareProps) => {
    // If entropy changed => re-render
    if (prev.entropy !== next.entropy) return false;

    // Otherwise, skip re-render
    return true;
};

const Square = React.memo(SquareImpl, arePropsEqual);

export default React.memo(Square);