import { useRef, useMemo, useState, useEffect } from 'react';
import AnalyzeForWFC from '../WFC/AnalyzeForWFC';
import SourceDataForWFC from './SourceDataForWFC';
import { OverlappingModel } from '../WFC/WFCAlgorithm';

export function useWFC(
    thought: string,
    seed: number,
    ifReady: boolean,
    impression: 'words' | 'chars',
    // startWFC: boolean
) {
    const analyzeResult = useMemo(() => {
        if (!ifReady) return null;
        return AnalyzeForWFC(thought, seed);
    }, [thought, seed]);

    const source = useMemo(() => {
        if (!analyzeResult) return null;
        return SourceDataForWFC(analyzeResult, impression, 2);
    }, [analyzeResult, impression]);

    const config = useMemo(() => {
        if (!source) return null;
        return {
            data: source.data,
            dataWidth: source.width,
            dataHeight: source.height,
            outputWidth: source.resolution,
            outputHeight: source.resolution,
            N: 2,
            periodicInput: true,
            periodicOutput: true,
            symmetry: 8,
            ground: 0,
        };
    }, [source]);

    const modelRef = useRef<OverlappingModel | null>(null);

    const [output, setWfcOutput] = useState<Uint8ClampedArray | null>(null);
    const [entropies, setEntropies] = useState<number[]>(() => []);

    const [isComplete, setIterationIsComplete] = useState(false);
    const [isContradiction, setIsContradiction] = useState(false);

    const [requestNextIteration, setRequestNextIteration] = useState(0);

    // const [autoRunning, setAutoRunning] = useState(false);

    useEffect(() => {
        if (!config) {
            modelRef.current = null;
            setWfcOutput(null);
            setEntropies([]);
            setIterationIsComplete(false);
            setIsContradiction(false);
            return;
        }
        init();
    }, [config]);

    const init = () => {
        if (!config) return;
        const model = new OverlappingModel(config);
        model.initialize();
        model.clear();
        modelRef.current = model;

        setWfcOutput(null);
        setEntropies([]);
        setIterationIsComplete(false);
        setIsContradiction(false);
        setRequestNextIteration(0);
    }
    const updateEntropies = () => {
        if (!modelRef.current || !config) return;
        setEntropies(modelRef.current.entropies);
    }
    const captureOutput = () => {
        if (!modelRef.current || !config) return;
        const { outputWidth, outputHeight } = config;
        const array = new Uint8ClampedArray(outputWidth * outputHeight * 4);
        modelRef.current.graphics(array);
        setWfcOutput(array);
    }

    const step = () => {
        if (!modelRef.current || !config) return;
        const model = modelRef.current;
        const result = model.singleIteration(seed);
        updateEntropies();
        captureOutput();

        if (result === true) {
            setIterationIsComplete(true);
        } else if (result === false) {
            setIsContradiction(true);
        }
    }


    // useEffect(() => {
    //     if (!config) return; // not ready
    //     if (isComplete || isContradiction) {
    //         return;
    //     }
    //     const timer = setTimeout(step, 10);
    //     return () => clearTimeout(timer);
    // }, [isComplete, isContradiction, step, config]);


    useEffect(() => {
        if (!config) return;
        if (!ifReady) return;
        if (isComplete || isContradiction) return;

        step(); // does a singleIteration

        // If that returned null => not done => we can cause another re-render
        // by updating some state that triggers the effect again. For example:
        if (!isComplete && !isContradiction) {
            // setRequestNextIteration(prev => prev + 1);
            setRequestNextIteration((prev) => prev + 1);
        }
    }, [config, isComplete, isContradiction, requestNextIteration]);

    return {
        source,
        config,
        init,
        output,
        entropies,
        isComplete,
        isContradiction,
    };
}
