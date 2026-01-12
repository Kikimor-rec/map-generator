import { generateMap, convertToEditorFormat } from '../src/generators/generator';

console.log('Testing Feature Generation...');

const result = generateMap({
    seed: 'test-features',
    archetype: 'ship',
    subtype: 'explorer',
    danger: 0.8 // High danger for more hazards
});

if (!result.success || !result.map) {
    console.error('Generation failed', result.issues);
    process.exit(1);
}

const editorData = convertToEditorFormat(result.map);
const rooms = editorData.rooms;
const roomsWithFeatures = rooms.filter(r => r.metadata && (r.metadata.loot?.length || r.metadata.hazards?.length));

console.log(`Generated ${rooms.length} rooms.`);
console.log(`${roomsWithFeatures.length} rooms have features.`);

roomsWithFeatures.slice(0, 10).forEach(r => {
    console.log(`[${r.type}] ${r.name}`);
    if (r.metadata?.hazards?.length) console.log('  Hazards:', r.metadata.hazards.join(', '));
    if (r.metadata?.loot?.length) console.log('  Loot:', r.metadata.loot.join(', '));
    if (r.objects?.length) console.log(`  Map Objects: ${r.objects.length} generated`);
});

if (roomsWithFeatures.length === 0) {
    console.error("No features generated! Check configuration.");
}
