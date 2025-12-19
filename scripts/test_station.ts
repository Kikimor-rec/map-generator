
import { generateMap } from '../src/generators/generator';

console.log("Starting Skeleton Generator Test (Station)...");

const result = generateMap({
    archetype: 'station',
    subtype: 'orbital',
    seed: 'station-seed-999',
    sizeTier: 'md'
});

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

// Plot Corridors
deck.connectors.forEach(c => {
    c.path.forEach(p => {
        const gx = Math.floor(p.x / 40);
        const gy = Math.floor(p.y / 40);
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
            if (grid[gy][gx] === '.') {
                grid[gy][gx] = 'C';
            } else if (grid[gy][gx] === 'R') {
                grid[gy][gx] = 'X'; // Overlap
            }
        }
    });
});

console.log("Station Layout Preview:");
// Print center crop of grid
const midY = Math.floor(gridH / 2);
const startY = Math.max(0, midY - 20);
const endY = Math.min(gridH, midY + 20);

for (let y = startY; y < endY; y++) {
    console.log(grid[y].slice(0, 80).join(''));
}

console.log("Test Complete.");
