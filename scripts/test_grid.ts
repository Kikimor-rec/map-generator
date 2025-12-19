import { generateMap } from '../src/generators/generator';
import { RoomType } from '../src/core/types';
import { GenerationRequest } from '../src/generators/types';

console.log("Starting Skeleton Generator Test (Capital/Grid)...");

const request: any = {
    seed: 'TEST_SEED_123',
    archetype: 'capital', // Testing Grid
    subtype: 'dreadnought',
    styleProfile: 'military',
    sizeTier: 'lg',
    loopiness: 0.5,
    danger: 0.5
};

const result = generateMap(request);

if (!result.success) {
    console.error("Generation Failed:", result.issues);
    process.exit(1);
}

const map = result.map;
if (!map) {
    console.error("No map generated!");
    process.exit(1);
}

const deck = map.decks[0];
console.log(`Generated Deck with ${deck.rooms.length} rooms and ${deck.connectors.length} corridors.`);

if (deck.rooms.length > 0) {
    console.log(`First Room: ${deck.rooms[0].label} (${deck.rooms[0].id})`);
    console.log(`Ports:`, JSON.stringify(deck.rooms[0].ports, null, 2));
}

// ASCII Visualization
const gridW = deck.gridWidth;
const gridH = deck.gridHeight;
const grid: string[][] = Array(gridH).fill(null).map(() => Array(gridW).fill('.'));

// Plot Rooms
deck.rooms.forEach(r => {
    for (let y = 0; y < r.gridHeight; y++) {
        for (let x = 0; x < r.gridWidth; x++) {
            const gx = r.gridX + x;
            const gy = r.gridY + y;
            if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
                grid[gy][gx] = 'R';
            }
        }
    }
});

// Plot Corridors (simplified)
deck.connectors.forEach(c => {
    c.path.forEach(p => {
        const gx = Math.floor(p.x / 40); // Assuming 40px grid from skeleton generator
        const gy = Math.floor(p.y / 40);
        // Note: Skeleton generator uses simplified path points which might be grid coords or pixels.
        // Let's check: In skeletonGenerator, x/y are raw grid coords, but attached rooms converted to pixels (x*40).
        // The skeleton returns LayoutConnectors. 
        // In generator.ts convertToEditorFormat handles pixel conversion? 
        // Wait, generateSkeletonLayout returns LayoutConnectors with `path`.
        // In SkeletonGenerator.ts:
        // connectors.push({ ..., path: spinePath, ... }) where spinePath is {x,y} in grid coords.
        // BUT LayoutConnector expects path in...? 
        // The `LayoutConnector` type definition says `path: Point[]`.
        // In `layout.ts`, `placedRoom.x` is `position.x * GRID_SIZE`.
        // The `SkeletonGenerator` I wrote returns `x: x * 40` for rooms.
        // But for connectors, it pushes `spinePath` which are grid coordinates (x, y). 
        // It DOES NOT scale them to 40.
        // This might be a BUG in my prototype. `generator.ts` expects pixel coordinates or handles it?
        // `convertToEditorFormat` assumes path points are... well it uses them directly.
        // Basic `layout.ts` `routeConnectors` returns `path` where points are `toWorld` (pixels).
        // SO: My SkeletonGenerator needs to scale connector points to pixels too!

        // Let's visualize what we have first, likely it will be tiny corridors at top left.
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
            if (grid[gy][gx] === '.') {
                grid[gy][gx] = 'C';
            } else if (grid[gy][gx] === 'R') {
                grid[gy][gx] = 'X'; // Overlap
            }
        }
    });
});

// console.log("Map Layout Preview:");
// Print center crop of grid
const midY = Math.floor(gridH / 2);
const startY = Math.max(0, midY - 15);
const endY = Math.min(gridH, midY + 15);

/*
for (let y = startY; y < endY; y++) {
    console.log(grid[y].slice(0, 80).join(''));
}
*/

console.log("Test Complete.");
