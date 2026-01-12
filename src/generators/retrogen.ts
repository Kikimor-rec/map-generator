import { Room } from '@core/types'
import { createRNG } from './rng'
import { ROOM_CONFIGS } from './roomConfigs'
import { pickWeighted } from './features'
import { generateObjectsForRoom } from './objectPlacer'
import { mapRoomTypeId } from './generator'
import { RoomMetadata } from './types'

/**
 * Rerolls detailing (features and objects) for a single room
 */
export function rerollRoomDressing(room: Room, dangerLevel: number = 0.3): Room {
    const rng = createRNG(crypto.randomUUID())

    // Find config
    let configId = 'corridor' // Default fallback

    // Try to find the config that matches the room type
    // This is O(N) where N is number of configs (small, ~30)
    for (const [id, _] of Object.entries(ROOM_CONFIGS)) {
        if (mapRoomTypeId(id) === room.type) {
            configId = id
            break
        }
    }

    const config = ROOM_CONFIGS[configId]

    // Create new metadata
    const newMetadata: RoomMetadata = {
        ...room.metadata,
        hazards: [],
        loot: [],
        passives: []
    }

    if (config && config.featureRules) {
        const rules = config.featureRules

        // Hazards
        const adjustedHazardChance = (rules.hazardChance ?? 0) * (0.5 + dangerLevel * 1.5)
        if (rng.chance(adjustedHazardChance) && rules.possibleHazards) {
            const count = rng.randomInt(1, 2)
            for (let i = 0; i < count; i++) {
                const hazard = pickWeighted(rules.possibleHazards, rng)
                if (hazard && !newMetadata.hazards?.includes(hazard)) {
                    newMetadata.hazards?.push(hazard)
                }
            }
        }

        // Loot
        const lootChance = rules.lootChance ?? 0
        if (rng.chance(lootChance) && rules.possibleLoot) {
            const count = rng.randomInt(1, 4)
            for (let i = 0; i < count; i++) {
                const item = pickWeighted(rules.possibleLoot, rng)
                if (item) {
                    newMetadata.loot?.push(item)
                }
            }
        }
    }

    // Generate new objects
    const newObjects = generateObjectsForRoom({
        ...room,
        metadata: newMetadata as unknown as Record<string, unknown>
    }, newMetadata)

    return {
        ...room,
        metadata: newMetadata as unknown as Record<string, unknown>,
        objects: newObjects
    }
}
