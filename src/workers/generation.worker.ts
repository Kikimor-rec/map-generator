
import {
    generateMap,
    GeneratorOptions
} from '../generators';
import { runQualityPipeline, QualityPipelineOptions, RefinementUpdate } from '../generators/quality';

// Define the shape of messages
export type WorkerMessage =
    | { type: 'START_GENERATION', payload: GeneratorOptions & { useQuality: boolean, qualityMode?: string } }
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
                // Run Standard Generator
                // This is synchronous. To allow "Progress" we might need to modify generateMap to yield?
                // Or just fake it for now since it's fast.
                ctx.postMessage({ type: 'PROGRESS', payload: { progress: 50, message: 'Generating Layout...', stage: 'layout' } });

                // Slight delay to allow UI to update if we want (optional)
                // await new Promise(r => setTimeout(r, 10));

                const result = generateMap(payload);

                if (!signal.aborted) {
                    ctx.postMessage({ type: 'COMPLETE', payload: result.map }); // Return just the map object to match quality output
                }
            }

        } catch (err: any) {
            ctx.postMessage({ type: 'ERROR', payload: { message: err.message, detail: err } });
        } finally {
            currentController = null;
        }
    }
};
