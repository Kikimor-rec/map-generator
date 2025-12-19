
import { generateMap } from '../src/generators/generator';
import { GenerationRequest } from '../src/generators/types';

console.log("Starting Reproduction Test (Ship/Freighter/MD)...");

const request: any = {
    seed: 'QWHJGV9K', // Seed from screenshot
    archetype: 'ship',
    subtype: 'freighter', // 'Cargo Freighter' -> 'freighter' usually
    styleProfile: 'utilitarian',
    sizeTier: 'md',
    loopiness: 0.5,
    danger: 0.3
};

const startTime = Date.now();
const result = generateMap(request);
const endTime = Date.now();

console.log(`Generation took ${endTime - startTime}ms`);

if (!result.success) {
    console.error("Generation Failed:", result.issues);
} else {
    console.log("Generation Success!");
    console.log(`Rooms: ${result.map.decks[0].rooms.length}`);
    console.log(`Connectors: ${result.map.decks[0].connectors.length}`);
}
