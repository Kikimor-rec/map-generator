
import {
    generateMapAsync,
    type GenerationQualityProfile,
    type GeneratorOptions
} from '../generators';

// Define the shape of messages
export type WorkerMessage =
    | { type: 'START_GENERATION', payload: GeneratorOptions }
    | { type: 'CANCEL' };

export type WorkerResponse =
    | { type: 'PROGRESS', payload: { progress: number, message: string, stage?: string } }
    | { type: 'COMPLETE', payload: any }
    | { type: 'ERROR', payload: { message: string, detail?: any } };

// Global context as any (standard worker pattern)
const ctx: Worker = self as any;

let currentController: AbortController | null = null;

function normalizeQualityProfile(value: unknown): GenerationQualityProfile {
    return value === 'draft' || value === 'polish' ? value : 'standard';
}

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

            const result = await generateMapAsync({
                seed: payload.seed,
                archetype: payload.archetype,
                subtype: payload.subtype,
                sizeTier: payload.sizeTier,
                styleProfile: payload.styleProfile,
                loopiness: payload.loopiness,
                danger: payload.danger,
                skipValidation: payload.skipValidation,
                routing: payload.routing,
                qualityProfile: normalizeQualityProfile(payload.qualityProfile),
            }, {
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
            if (!result.success || !result.map) {
                throw new Error(result.issues.map(issue => issue.message).join(', ') || 'Generation failed');
            }

            ctx.postMessage({ type: 'PROGRESS', payload: { progress: 85, message: 'Placing doors...', stage: 'doors' } });
            await new Promise(r => setTimeout(r, 10));

            ctx.postMessage({ type: 'PROGRESS', payload: { progress: 95, message: 'Converting to map format...', stage: 'convert' } });
            await new Promise(r => setTimeout(r, 10));

            if (!signal.aborted) {
                ctx.postMessage({ type: 'COMPLETE', payload: result.map });
            }

        } catch (err: any) {
            ctx.postMessage({ type: 'ERROR', payload: { message: err.message, detail: err } });
        } finally {
            currentController = null;
        }
    }
};
