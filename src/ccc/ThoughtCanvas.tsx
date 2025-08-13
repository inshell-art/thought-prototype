import React, { useEffect, useState } from 'react';
import Grid from './Grid';
import ThoughtText from './ThoughtText';
import { useWFC } from './WFCGenerate';
import ImagePreview from '../Analyze&Preview/ImagePreview';

type WFCData = {
    source: {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        resolution: number;
    } | null;
    config: {
        data: Uint8ClampedArray;
        dataWidth: number;
        dataHeight: number;
        outputWidth: number;
        outputHeight: number;
        N: number;
        periodicInput: boolean;
        periodicOutput: boolean;
        symmetry: number;
    } | null;
    output: Uint8ClampedArray | null;
    entropies: number[];
    isComplete: boolean;
    isContradiction: boolean;
};

type ThoughtCanvasProps = {
    thought: string;
    seed: number;
    // isReady: boolean;
    onAllLayersDone: () => void;
    width: number;
    height: number;
    // strokeSkeleton: any;
};

const ThoughtCanvas: React.FC<ThoughtCanvasProps> = ({
    thought,
    seed,
    // isReady,
    onAllLayersDone,
    width,
    height,
}) => {

    const [impression, setImpression] = useState<'words' | 'chars' | 'stroke' | null>(null);

    useEffect(() => {
        if (thought) {
            setImpression('words');
            wordWFC.init?.();
            charWFC.init?.();
        } else {
            setImpression(null);
        }
    }, [thought]);

    const doWords = (impression === 'words' || impression === 'chars' || impression === 'stroke');
    const doChars = (impression === 'chars' || impression === 'stroke');
    // const doStroke = (impression === 'stroke');

    const wordWFC = useWFC(thought, seed, doWords, 'words');
    // console.log('wordWFC');
    const charWFC = useWFC(thought, seed, doChars, 'chars');
    console.log(doChars)

    // Check if word wave is done => switch to char wave
    useEffect(() => {
        if (impression !== 'words') return;
        const { isComplete, isContradiction } = wordWFC;
        if (isComplete || isContradiction) {
            console.log('word wave done => start chars');
            setImpression('chars');
        }
    }, [impression]);

    // If char wave is done => switch to stroke 
    useEffect(() => {
        if (impression !== 'chars') return;
        const { isComplete, isContradiction } = charWFC;
        if (isComplete || isContradiction) {
            setImpression('stroke');
            console.log('chars wave done => done');
            onAllLayersDone?.();
            console.log('all layers done');
        }
    }, [impression]);

    // // If stroke is done => finish
    // useEffect(() => {
    //     if (impression !== 'stroke') return;
    //     const { isComplete } = strokeSkeleton;
    //     if (isComplete) {
    //         console.log('stroke done => done');
    //     }
    // }, [impression]);




    // ================ RENDER LAYERS ================
    // Layer 1: Word wave squares

    let wordLayer = null;
    if (wordWFC.config &&
        (impression === 'words' || impression === 'chars' || impression === 'stroke')) {
        const { output: wordWfcOutput, entropies: wordEntropies } = wordWFC;

        wordLayer = (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1
            }}
            >
                <Grid
                    cols={wordWFC.config.outputWidth}
                    rows={wordWFC.config.outputHeight}
                    // cellSize={cellSize}
                    width={width}
                    height={height}
                    wfcOutput={wordWfcOutput}
                    entropies={wordEntropies}
                />
            </div>
        );
    }

    // Layer 2: Char wave squares
    let charLayer = null;
    if (charWFC.config &&
        (impression === 'chars' || impression === 'stroke')) {
        const { output: charWfcOutput, entropies: charEntropies } = charWFC;

        charLayer = (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 2
            }} >
                <Grid
                    cols={charWFC.config.outputWidth}
                    rows={charWFC.config.outputHeight}
                    width={width}
                    height={height}
                    wfcOutput={charWfcOutput}
                    entropies={charEntropies}
                />
            </div>
        );
    }

    let strokeLayer = null;

    // RENDER: Source previews (Word + Char)
    let sourcePreview = null;
    const scaleFactor = 10;
    if (wordWFC?.source || charWFC?.source) {
        sourcePreview = (
            <div className="thought-sourcePreview">

                {wordWFC?.source && (
                    <div>
                        <p>Word Source</p>
                        <ImagePreview
                            data={wordWFC.source.data}
                            dataWidth={wordWFC.source.width}
                            dataHeight={wordWFC.source.height}
                            previewWidth={wordWFC.source.width * scaleFactor}
                            previewHeight={wordWFC.source.height * scaleFactor}
                            pixelated={true}
                        />
                    </div>
                )}
                {charWFC?.source && (
                    <div>
                        <p>Char Source</p>
                        <ImagePreview
                            data={charWFC.source.data}
                            dataWidth={charWFC.source.width}
                            dataHeight={charWFC.source.height}
                            previewWidth={charWFC.source.width * scaleFactor}
                            previewHeight={charWFC.source.height * scaleFactor}
                            pixelated={true}
                        />
                    </div>
                )}
            </div>

        );
    }

    let outputPreview = null;
    if (wordWFC?.config || charWFC?.config) {
        outputPreview = (
            <div className="thought-outputPreview">
                {wordWFC?.config && wordWFC.output && (
                    <div>
                        <p>Word Output</p>
                        <ImagePreview
                            data={wordWFC.output}
                            dataWidth={wordWFC.config.outputWidth}
                            dataHeight={wordWFC.config.outputHeight}
                            previewWidth={100}
                            previewHeight={100}
                            pixelated={false}
                        />
                    </div>
                )}
                {charWFC?.config && charWFC.output && (
                    <div>
                        <p>Char Output</p>
                        <ImagePreview
                            data={charWFC.output}
                            dataWidth={charWFC.config.outputWidth}
                            dataHeight={charWFC.config.outputHeight}
                            previewWidth={100}
                            previewHeight={100}
                            pixelated={false}
                        />
                    </div>
                )}
            </div>
        );
    }



    return (
        <div className="thought-renderer">

            <div className="thought-canvas">
                {wordLayer}
                {charLayer}
                {/* {strokeLayer} */}
                <ThoughtText thought={thought} />
            </div>

            {sourcePreview}
            {outputPreview}

        </div>


    );
};

export default ThoughtCanvas;
