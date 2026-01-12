import { Room, MapObject, ObjectCategory, LayerType, Point, Size, ROOM_TYPE_CONFIGS } from '@core/types';
import { RoomMetadata } from './types';
import { OBJECT_TEMPLATES, ObjectTemplate } from './objectTemplates';
import { v4 as uuidv4 } from 'uuid';

// Helper to check if a point is inside room bounds with padding
function isInside(point: Point, room: Room, padding: number): boolean {
    return (
        point.x >= room.bounds.x + padding &&
        point.x <= room.bounds.x + room.bounds.width - padding &&
        point.y >= room.bounds.y + padding &&
        point.y <= room.bounds.y + room.bounds.height - padding
    );
}

// Simple random placement avoiding existing objects (naively)
function findRandomPosition(room: Room, existingObjects: MapObject[]): Point {
    const padding = 30; // Keep away from walls
    const maxAttempts = 10;

    for (let i = 0; i < maxAttempts; i++) {
        const x = room.bounds.x + padding + Math.random() * (room.bounds.width - padding * 2);
        const y = room.bounds.y + padding + Math.random() * (room.bounds.height - padding * 2);

        // Very basic collision check
        const collision = existingObjects.some(obj => {
            const dx = obj.position.x - x;
            const dy = obj.position.y - y;
            return Math.sqrt(dx * dx + dy * dy) < 40; // 40px radius check
        });

        if (!collision) {
            return { x, y };
        }
    }

    return {
        x: room.bounds.x + room.bounds.width / 2,
        y: room.bounds.y + room.bounds.height / 2
    };
}

// Check if an object fits at position
function fits(position: Point, size: Size, room: Room, existingObjects: MapObject[]): boolean {
    const padding = 5;
    // Room bounds check
    if (
        position.x - size.width / 2 < room.bounds.x + padding ||
        position.x + size.width / 2 > room.bounds.x + room.bounds.width - padding ||
        position.y - size.height / 2 < room.bounds.y + padding ||
        position.y + size.height / 2 > room.bounds.y + room.bounds.height - padding
    ) {
        return false;
    }

    // Collision check
    return !existingObjects.some(obj => {
        // Simple AABB check
        const aLeft = position.x - size.width / 2;
        const aRight = position.x + size.width / 2;
        const aTop = position.y - size.height / 2;
        const aBottom = position.y + size.height / 2;

        const bLeft = obj.position.x - obj.size.width / 2;
        const bRight = obj.position.x + obj.size.width / 2;
        const bTop = obj.position.y - obj.size.height / 2;
        const bBottom = obj.position.y + obj.size.height / 2;

        return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
    });
}

function tryPlaceObject(
    templateId: string,
    room: Room,
    existingObjects: MapObject[],
    count: number = 1
) {
    const template = OBJECT_TEMPLATES[templateId];
    if (!template) return;

    for (let c = 0; c < count; c++) {
        for (let attempt = 0; attempt < 15; attempt++) {
            const pos = {
                x: room.bounds.x + 20 + Math.random() * (room.bounds.width - 40),
                y: room.bounds.y + 20 + Math.random() * (room.bounds.height - 40)
            };

            if (fits(pos, { width: template.width, height: template.height }, room, existingObjects)) {
                existingObjects.push({
                    id: uuidv4(),
                    templateId: template.id,
                    name: template.name,
                    category: template.category,
                    position: pos,
                    size: { width: template.width, height: template.height },
                    rotation: 0, // Could be random for some items
                    color: template.color,
                    isVisible: true,
                    layer: template.layer,
                    metadata: {}
                });
                break; // Placed successfully
            }
        }
    }
}

export function generateObjectsForRoom(room: Room, metadata?: RoomMetadata): MapObject[] {
    const objects: MapObject[] = [];

    // 0. Auto-furnish based on Room Type
    const roomConfig = ROOM_TYPE_CONFIGS[room.type];
    if (roomConfig && roomConfig.suggestedObjects) {
        // Calculate room area to decide density
        const area = (room.bounds.width * room.bounds.height) / (40 * 40); // in grid cells

        roomConfig.suggestedObjects.forEach(objId => {
            // Determine count based on object type and room size
            let count = 1;
            if (['chair', 'crate', 'shelf'].includes(objId)) {
                count = Math.max(1, Math.floor(area / 4));
            } else if (['bed', 'bunk'].includes(objId)) {
                count = Math.max(1, Math.floor(area / 6));
            } else if (['reactor_core', 'warp_core', 'captain_chair'].includes(objId)) {
                count = 1;
            }

            tryPlaceObject(objId, room, objects, count);
        });
    }

    if (!metadata) return objects;

    // 1. Generate Hazards
    metadata.hazards?.forEach((hazard, index) => {
        const position = findRandomPosition(room, objects);
        objects.push({
            id: uuidv4(),
            templateId: 'hazard_generic',
            name: hazard, // e.g. "Radiation Leak"
            category: ObjectCategory.Hazard,
            position,
            size: { width: 32, height: 32 },
            rotation: 0,
            isVisible: true,
            layer: LayerType.GM, // Hazards often GM only or special layer? Let's use GM for now or Structure
            metadata: { type: 'hazard', description: hazard }
        });
    });

    // 2. Generate Loot
    metadata.loot?.forEach((lootItem, index) => {
        const position = findRandomPosition(room, objects);
        objects.push({
            id: uuidv4(),
            templateId: 'loot_generic',
            name: lootItem,
            category: ObjectCategory.Equipment,
            position,
            size: { width: 24, height: 24 },
            rotation: Math.random() * 360,
            isVisible: true,
            layer: LayerType.Furniture,
            metadata: { type: 'loot', description: lootItem }
        });
    });

    return objects;
}
