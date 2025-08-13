import React, { useMemo } from 'react';
import Square from './Square';
import { UpscaledCanvas } from './UpscaleHelper';

type GridProps = {
    cols: number;
    rows: number;
    width: number;
    height: number;
    wfcOutput?: Uint8ClampedArray | null;
    entropies?: number[];
};

const Grid: React.FC<GridProps> = ({ cols, rows, width, height, wfcOutput, entropies }) => {
    const integerCell = Math.floor(width / cols);
    const totalUsedWidth = integerCell * cols;
    const totalUsedHeight = integerCell * rows;

    const entireCanvas = useMemo(() => {
        if (!wfcOutput) return null;
        return UpscaledCanvas(wfcOutput, cols, rows, width, height, false);
    }, [wfcOutput]);

    const squares = Array.from({ length: cols * rows }, (_, index) => {
        const entropy = entropies ? entropies[index] : 0;
        return (
            <Square
                index={index}
                // col={index % cols}
                // row={Math.floor(index / rows)}
                cols={cols}
                rows={rows}
                // size={cellSize}
                width={width}
                height={height}
                entireCanvas={entireCanvas}
                entropy={entropy}
            />
        );
    });

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: width,
                height: height,
            }}
        >
            <div
                style={{
                    width: totalUsedWidth,
                    height: totalUsedHeight,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, ${integerCell}px)`,
                    gridTemplateRows: `repeat(${rows}, ${integerCell}px)`,

                }}
            >
                {squares}
            </div>
        </div>
    );
};


export default React.memo(Grid);