
import {
    generateMap,
    generateBestGridMapAsync,
    getDefaultGridCandidateCount,
    GeneratorOptions
} from '../generators';
import { runQualityPipeline, QualityPipelineOptions, RefinementUpdate } from '../generators/quality';

// Define the shape of messages
export type WorkerMessage =
    | { type: 'START_GENERATION', payload: GeneratorOptions & { useQuality: boolean, qualityMode?: string, engine?: 'grid' | 'legacy' } }
    | { type: 'CANCEL' };

export type WorkerResponse =
    | { type: 'PROGRESS', payload: { progress: number, message: string, stage?: string } }
    | { type: 'COMPLETE', payload: any }
    | { type: 'ERROR', payload: { message: string, detail?: any } };

// Global context as any (standard worker pattern)
const ctx: Worker = self as any;

let currentController: AbortController | null = null;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type } = event.data;

    if (type === 'CANCEL') {
        if (currentController) {
            currentController.abort();
            currentController = null;
        }
        return;
    }

    if (type === 'START_GENERATION') {
        const { payload } = event.data;
        try {
            currentController = new AbortController();
            const signal = currentController.signal;

            ctx.postMessage({ type: 'PROGRESS', payload: { progress: 0, message: 'Initializing...', stage: 'init' } });

            if (payload.useQuality) {
                // Run Quality Pipeline
                const pipelineOptions: any = { // Adapt type as needed
                    seed: payload.seed,
                    qualityMode: payload.qualityMode || 'standard',
                    styleProfile: payload.styleProfile,
                    mapParams: {
                        archetype: payload.archetype,
                        subtype: payload.subtype,
                        sizeTier: payload.sizeTier,
                        loopiness: payload.loopiness,
                        danger: payload.danger,
                        gridSize: 40
                    }
                };

                // We need to bridge the onUpdate callback to postMessage
                // Since runQualityPipeline is async, we can await it.
                // BUT looking at pipeline.ts, it returns a Promise.
                // Does it support specific abort signal? No, checking code...
                // pipeline.ts doesn't seem to take an AbortSignal argument.
                // However, we can check `signal.aborted` in between callbacks if we modified pipeline.ts, 
                // or just ignore the result if cancelled.

                const onUpdate = (update: RefinementUpdate) => {
                    if (signal.aborted) return;
                    ctx.postMessage({
                        type: 'PROGRESS',
                        payload: {
                            progress: update.progress * 100,
                            message: `Phase: ${update.type} - Candidates: ${update.candidatesEvaluated}`,
                            stage: update.type
                        }
                    });
                };

                pipelineOptions.refinement = {
                    onUpdate,
                    abortSignal: signal
                };

                const result = await runQualityPipeline(pipelineOptions);

                if (!signal.aborted) {
                    ctx.postMessage({ type: 'COMPLETE', payload: result });
                }
            } else {
                // Run Standard Generator with real progress stages
                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 5, message: 'Generating room program...', stage: 'program' } });
                await new Promise(r => setTimeout(r, 10));

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 15, message: 'Carving hull shape...', stage: 'hull' } });
                await new Promise(r => setTimeout(r, 10));

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 30, message: 'Partitioning zones...', stage: 'zones' } });
                await new Promise(r => setTimeout(r, 10));

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 45, message: 'Placing rooms (graph-first)...', stage: 'rooms' } });
                await new Promise(r => setTimeout(r, 10));

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 60, message: 'Routing corridors (MST + A*)...', stage: 'corridors' } });
                await new Promise(r => setTimeout(r, 10));

                let resultMap;
                const candidateCount = payload.gridCandidateCount ??
                    getDefaultGridCandidateCount(payload.sizeTier);

                if ((payload.engine ?? 'grid') === 'grid' && candidateCount > 1) {
                    const selected = await generateBestGridMapAsync({
                        seed: payload.seed,
                        archetype: payload.archetype,
                        subtype: payload.subtype,
                        sizeTier: payload.sizeTier,
                        styleProfile: payload.styleProfile,
                        loopiness: payload.loopiness,
                        danger: payload.danger,
                        debug: false,
                    }, candidateCount, {
                        signal,
                        onCandidate: (completed, total) => {
                            ctx.postMessage({
                                type: 'PROGRESS',
                                payload: {
                                    progress: 60 + (completed / total) * 24,
                                    message: `Reviewing candidate ${completed} of ${total}...`,
                                    stage: 'candidate-selection'
                                }
                            });
                        }
                    });
                    if (signal.aborted) return;
                    if (!selected.success || !selected.map) {
                        throw new Error(selected.error || 'No valid grid candidate');
                    }
                    resultMap = selected.map;
                } else {
                    const result = generateMap({ ...payload, gridCandidateCount: 1 });
                    if (!result.success || !result.map) {
                        throw new Error(result.issues.map(issue => issue.message).join(', ') || 'Generation failed');
                    }
                    resultMap = result.map;
                }

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 85, message: 'Placing doors...', stage: 'doors' } });
                await new Promise(r => setTimeout(r, 10));

                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 95, message: 'Converting to map format...', stage: 'convert' } });
                await new Promise(r => setTimeout(r, 10));

                if (!signal.aborted) {
                    ctx.postMessage({ type: 'COMPLETE', payload: resultMap });
                }
            }

        } catch (err: any) {
            ctx.postMessage({ type: 'ERROR', payload: { message: err.message, detail: err } });
        } finally {
            currentController = null;
        }
    }
};
