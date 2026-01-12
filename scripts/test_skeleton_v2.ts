
import { generateSkeletonLayoutV2 } from '../src/generators/skeletonGeneratorV2';
import { GenerationRequest, TopologyGraph, RoomProgramEntry } from '../src/generators/types';

console.log("Starting Skeleton Generator V2 Test...");

// Mock Request
const request: GenerationRequest = {
    seed: 'test-seed-v2',
    archetype: 'ship',
    subtype: 'capital',
    sizeTier: 'lg', // Force large to test multi-spine
    styleProfile: 'utilitarian'
};

// Mock Topology (Room Program)
const rooms: RoomProgramEntry[] = [
    // Hubs
    { id: 'bridge', type: 'bridge', label: 'Bridge', importance: 'key', minSize: { w: 4, h: 4 }, targetSize: { w: 6, h: 5 }, tags: [], required: true, weight: 1, zone: 'core' },
    { id: 'engineering', type: 'engineering', label: 'Engineering', importance: 'key', minSize: { w: 6, h: 6 }, targetSize: { w: 8, h: 8 }, tags: [], required: true, weight: 1, zone: 'core' },
    { id: 'medbay', type: 'medbay', label: 'MedBay', importance: 'hub', minSize: { w: 4, h: 4 }, targetSize: { w: 5, h: 5 }, tags: [], required: true, weight: 1, zone: 'ops' },
    { id: 'cargo1', type: 'cargoBay', label: 'Cargo A', importance: 'hub', minSize: { w: 4, h: 4 }, targetSize: { w: 6, h: 6 }, tags: [], required: true, weight: 1, zone: 'cargo' },
    { id: 'cargo2', type: 'cargoBay', label: 'Cargo B', importance: 'hub', minSize: { w: 4, h: 4 }, targetSize: { w: 6, h: 6 }, tags: [], required: true, weight: 1, zone: 'cargo' },
    { id: 'mess', type: 'messHall', label: 'Mess Hall', importance: 'hub', minSize: { w: 4, h: 4 }, targetSize: { w: 5, h: 5 }, tags: [], required: true, weight: 1, zone: 'ops' },

    // Leaves
    ...Array(20).fill(0).map((_, i) => ({
        id: `quarters_${i}`, type: 'quarters', label: 'Quarters', importance: 'normal', minSize: { w: 3, h: 3 }, targetSize: { w: 3, h: 3 }, tags: [], required: false, weight: 1, zone: 'ops'
    })),
    ...Array(10).fill(0).map((_, i) => ({
        id: `storage_${i}`, type: 'storage', label: 'Storage', importance: 'normal', minSize: { w: 2, h: 2 }, targetSize: { w: 3, h: 3 }, tags: [], required: false, weight: 1, zone: 'cargo'
    }))
];

const topology: TopologyGraph = {
    rooms: rooms as any, // Quick cast for mock
    connectors: [],
    deckCount: 1,
    roomsByDeck: [rooms.map(r => r.id)],
    metrics: {} as any
};

// Generate
const layouts = generateSkeletonLayoutV2({ request, topology });
const deck = layouts[0];

console.log(`Generated Deck: ${deck.gridWidth}x${deck.gridHeight}`);
console.log(`Placed Rooms: ${deck.rooms.length}`);
console.log(`Connectors: ${deck.connectors.length}`);

// Analysis
const hubRooms = deck.rooms.filter(r => r.ports.length >= 2);
const leafRooms = deck.rooms.filter(r => r.ports.length === 1);
console.log(`Hub Rooms (2+ ports): ${hubRooms.map(r => r.label).join(', ')}`);
console.log(`Leaf Rooms (1 port): ${leafRooms.length}`);

// ASCII Visualization
const gridW = deck.gridWidth;
const gridH = deck.gridHeight;
const grid: string[][] = Array(gridH).fill(null).map(() => Array(gridW).fill('.'));

// Plot Connectors first
deck.connectors.forEach(c => {
    c.path.forEach(p => {
        const gx = Math.floor(p.x / 40);
        const gy = Math.floor(p.y / 40);
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
            grid[gy][gx] = '#';
        }
    });
});

// Plot Rooms
deck.rooms.forEach(r => {
    for (let y = 0; y < r.gridHeight; y++) {
        for (let x = 0; x < r.gridWidth; x++) {
            const gx = r.gridX + x;
            const gy = r.gridY + y;
            if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
                if (r.ports.length > 1) {
                    grid[gy][gx] = 'H'; // Hub
                } else {
                    grid[gy][gx] = 'L'; // Leaf
                }
            }
        }
    }
});

// Print (scaled down or cropped)
const startY = Math.max(0, Math.floor(gridH / 2) - 20);
const endY = Math.min(gridH, Math.floor(gridH / 2) + 20);

console.log("\nMap Layout (H=Hub, L=Leaf, #=Corridor):");
for (let y = startY; y < endY; y++) {
    console.log(grid[y].join('').substring(0, 100)); // Crop width
}
