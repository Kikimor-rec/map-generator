import {
    DeckLayout,
    GenerationRequest,
    RoomMetadata,
    RoomTypeConfig,
    SeededRNG,
    WeightedItem
} from './types';
import { ROOM_CONFIGS } from './roomConfigs';
import { createRNG } from './rng';

export function generateRoomFeatures(
    layouts: DeckLayout[],
    request: GenerationRequest
): void {
    const rng = createRNG(String(request.seed) + '-features');
    const dangerLevel = request.danger ?? 0.3;

    for (const layout of layouts) {
        for (const room of layout.rooms) {
            const config = ROOM_CONFIGS[room.roomType];
            if (!config || !config.featureRules) continue;

            const rules = config.featureRules;
            const metadata: RoomMetadata = {
                hazards: [],
                loot: [],
                passives: [],
                description: config.description
            };

            // Generate Hazards
            // Danger modifies hazard chance: 0.0 -> 0.5x, 0.5 -> 1.25x, 1.0 -> 2.0x base chance
            const adjustedHazardChance = (rules.hazardChance ?? 0) * (0.5 + dangerLevel * 1.5);
            if (rng.chance(adjustedHazardChance) && rules.possibleHazards) {
                const count = rng.randomInt(1, 2); // 1-2 hazards
                for (let i = 0; i < count; i++) {
                    const hazard = pickWeighted(rules.possibleHazards, rng);
                    if (hazard && !metadata.hazards?.includes(hazard)) {
                        metadata.hazards?.push(hazard);
                    }
                }
            }

            // Generate Loot
            const lootChance = rules.lootChance ?? 0;
            if (rng.chance(lootChance) && rules.possibleLoot) {
                const count = rng.randomInt(1, 4); // 1-4 loot items
                for (let i = 0; i < count; i++) {
                    const item = pickWeighted(rules.possibleLoot, rng);
                    if (item) {
                        // Loot can duplicate (e.g. 2x Medkit)
                        metadata.loot?.push(item);
                    }
                }
            }

            // Assign to room
            room.metadata = metadata;
        }
    }
}

export function pickWeighted(items: WeightedItem[], rng: SeededRNG): string | null {
    if (items.length === 0) return null;
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let r = rng.random() * totalWeight;

    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item.id;
    }
    return items[items.length - 1].id;
}
