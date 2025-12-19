
import { generateMap } from '../src/generators/generator';
import { GenerationRequest } from '../src/generators/types';

const variants = [
    { type: 'freighter', loops: 0.8 },
    { type: 'military', loops: 0.2 }, // Low loops, strict symmetry
    { type: 'explorer', loops: 0.6 }
];

variants.forEach(v => {
    console.log(`\nTesting ${v.type} (Loopiness: ${v.loops})...`);
    const request: any = {
        seed: 'TEST_SEED_' + v.type,
        archetype: 'ship',
        subtype: v.type,
        styleProfile: 'utilitarian',
        sizeTier: 'md',
        loopiness: v.loops,
        danger: 0.3
    };

    try {
        const startTime = Date.now();
        const result = generateMap(request);
        const endTime = Date.now();

        console.log(`Generation took ${endTime - startTime}ms`);
        if (result.success) {
            const deck = result.map.decks[0];
            console.log(`Success! Rooms: ${deck.rooms.length}, Connectors: ${deck.connectors.length}`);
            // Count room types to verify valid program
            const types = deck.rooms.map(r => r.roomType);
            console.log(`Types: ${types.slice(0, 5).join(', ')}...`);
        } else {
            console.error("Failed:", result.issues);
        }
    } catch (e) {
        console.error("Crash:", e);
    }
});
