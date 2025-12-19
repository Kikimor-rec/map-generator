/**
 * SkeletonGenerator V2
 * 
 * Improved skeleton-based generation with:
 * - Hub Rooms: Key rooms that are PART of the skeleton (corridors pass through them)
 * - Leaf Rooms: Secondary rooms attached to the side of corridors
 * - Multi-Spine: Multiple parallel spines for medium/large ships
 * - Better TTRPG layout with tactical chokepoints
 */

import {
    DeckLayout,
    LayoutConnector,
    LayoutRoom,
    Junction,
    Socket,
    Port,
    Point,
    GenerationRequest,
    TopologyGraph,
    SeededRNG
} from './types';
import { createRNG } from './rng';
import { LayoutOptions } from './layout';

// ============================================================================
// TYPES
// ============================================================================

/** Hub Socket - a point where a HUB room interrupts the corridor */
interface HubSocket {
    id: string;
    type: 'hub';
    x: number;  // Grid coords
    y: number;
    /** Which corridor this hub interrupts */
    corridorId: string;
    /** Preferred room types for this hub */
    preferredTypes: string[];
    /** Entry direction (where corridor comes FROM) */
    entryDirection: 'top' | 'bottom' | 'left' | 'right';
    /** Exit direction (where corridor goes TO) */
    exitDirection: 'top' | 'bottom' | 'left' | 'right';
    /** Suggested size in grid units */
    suggestedWidth: number;
    suggestedHeight: number;
}

/** Leaf Socket - a point where a room attaches to the SIDE of a corridor */
interface LeafSocket {
    id: string;
    type: 'leaf';
    x: number;  // Grid coords
    y: number;
    /** Direction the room extends from corridor */
    direction: 'top' | 'bottom' | 'left' | 'right';
    /** Suggested size */
    suggestedWidth: number;
    suggestedHeight: number;
}

type SkeletonSocket = HubSocket | LeafSocket;

/** Corridor segment before room placement */
interface CorridorSegment {
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    width: number;  // Grid units
    /** Is this segment part of a main spine? */
    isSpine: boolean;
    /** Hub that interrupts this segment (if any) */
    interruptedByHub?: string;
}

interface SkeletonV2Result {
    segments: CorridorSegment[];
    hubs: HubSocket[];
    leaves: LeafSocket[];
    junctions: Junction[];
}

interface PlacedHub {
    socket: HubSocket;
    room: LayoutRoom;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CELL_SIZE = 40;

/** Room types that should be HUBs (part of main path) */
const HUB_ROOM_TYPES = [
    'bridge', 'cockpit', 'command',
    'engineering', 'reactor', 'powerCore',
    'medbay', 'medBay', 'infirmary',
    'cargoBay', 'cargo', 'hangar',
    'commonArea', 'messHall', 'lounge'
];

/** Room types that should be leaves (side rooms) */
const LEAF_ROOM_TYPES = [
    'quarters', 'cabin', 'bunk',
    'storage', 'closet', 'locker',
    'lab', 'science', 'research',
    'armory', 'weapons',
    'airlock', 'lifepod',
    'maintenance', 'utility'
];

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export class SkeletonGeneratorV2 {
    private rng: SeededRNG;

    constructor(rng: SeededRNG) {
        this.rng = rng;
    }

    /**
     * Generate skeleton based on ship parameters
     */
    generate(request: GenerationRequest, width: number, height: number): SkeletonV2Result {
        const archetype = request.archetype || 'ship';
        const sizeTier = request.sizeTier || 'md';

        // Determine number of spines based on size
        const spineCount = this.getSpineCount(sizeTier);

        if (archetype === 'station') {
            return this.generateStationSkeleton(width, height, spineCount);
        } else if (archetype === 'outpost') {
            return this.generateOutpostSkeleton(width, height);
        } else {
            return this.generateShipSkeleton(width, height, spineCount, request);
        }
    }

    private getSpineCount(sizeTier: string): number {
        switch (sizeTier) {
            case 'xs': return 1;
            case 'sm': return 1;
            case 'md': return this.rng.chance(0.4) ? 2 : 1;
            case 'lg': return this.rng.chance(0.6) ? 3 : 2;
            case 'xl': return 3;
            default: return 1;
        }
    }

    // ========================================================================
    // SHIP SKELETON (Linear with ribs)
    // ========================================================================

    private generateShipSkeleton(
        width: number,
        height: number,
        spineCount: number,
        request: GenerationRequest
    ): SkeletonV2Result {
        const segments: CorridorSegment[] = [];
        const hubs: HubSocket[] = [];
        const leaves: LeafSocket[] = [];
        const junctions: Junction[] = [];

        const centerX = Math.floor(width / 2);
        const spineStartY = Math.floor(height * 0.15);
        const spineEndY = Math.floor(height * 0.85);
        const spineHeight = spineEndY - spineStartY;

        // Calculate spine positions
        const spineSpacing = spineCount > 1 ? Math.floor(width * 0.25) : 0;
        const spineXPositions: number[] = [];

        if (spineCount === 1) {
            spineXPositions.push(centerX);
        } else if (spineCount === 2) {
            spineXPositions.push(centerX - spineSpacing);
            spineXPositions.push(centerX + spineSpacing);
        } else {
            spineXPositions.push(centerX - spineSpacing);
            spineXPositions.push(centerX);
            spineXPositions.push(centerX + spineSpacing);
        }

        // Generate each spine with hubs
        for (let si = 0; si < spineCount; si++) {
            const spineX = spineXPositions[si];
            const isMainSpine = si === Math.floor(spineCount / 2); // Center spine is main

            // Divide spine into segments with hubs
            const numHubs = isMainSpine ? 3 : 2;
            const hubPositions: number[] = [];

            for (let h = 1; h <= numHubs; h++) {
                const hubY = spineStartY + Math.floor(spineHeight * (h / (numHubs + 1)));
                hubPositions.push(hubY);
            }

            // Create spine segments between hubs
            let lastY = spineStartY;
            for (let h = 0; h <= hubPositions.length; h++) {
                const endY = h < hubPositions.length ? hubPositions[h] : spineEndY;

                // Create corridor segment
                segments.push({
                    id: `spine_${si}_seg_${h}`,
                    fromX: spineX,
                    fromY: lastY,
                    toX: spineX,
                    toY: endY,
                    width: isMainSpine ? 2 : 1,
                    isSpine: true
                });

                // Create hub at this position (except for last segment end)
                if (h < hubPositions.length) {
                    const hubTypes = this.getHubTypesForPosition(h, numHubs, isMainSpine);
                    hubs.push({
                        id: `hub_${si}_${h}`,
                        type: 'hub',
                        x: spineX,
                        y: hubPositions[h],
                        corridorId: `spine_${si}_seg_${h}`,
                        preferredTypes: hubTypes,
                        entryDirection: 'top',
                        exitDirection: 'bottom',
                        suggestedWidth: isMainSpine ? 5 : 4,
                        suggestedHeight: isMainSpine ? 4 : 3
                    });
                }

                lastY = endY;
            }

            // Add terminal hubs (bridge at top, engine at bottom)
            if (isMainSpine) {
                hubs.push({
                    id: `hub_${si}_bridge`,
                    type: 'hub',
                    x: spineX,
                    y: spineStartY - 3,
                    corridorId: `spine_${si}_seg_0`,
                    preferredTypes: ['bridge', 'cockpit', 'command'],
                    entryDirection: 'bottom',
                    exitDirection: 'bottom', // Dead end
                    suggestedWidth: 6,
                    suggestedHeight: 5
                });

                hubs.push({
                    id: `hub_${si}_engine`,
                    type: 'hub',
                    x: spineX,
                    y: spineEndY + 1,
                    corridorId: `spine_${si}_seg_${numHubs}`,
                    preferredTypes: ['engineering', 'reactor', 'engine'],
                    entryDirection: 'top',
                    exitDirection: 'top', // Dead end
                    suggestedWidth: 6,
                    suggestedHeight: 5
                });
            }
        }

        // Create ribs (cross-connections) between spines
        if (spineCount > 1) {
            const ribCount = Math.floor(spineHeight / 6);
            for (let r = 1; r <= ribCount; r++) {
                const ribY = spineStartY + Math.floor(spineHeight * (r / (ribCount + 1)));

                // Connect adjacent spines
                for (let s = 0; s < spineCount - 1; s++) {
                    const fromX = spineXPositions[s];
                    const toX = spineXPositions[s + 1];

                    segments.push({
                        id: `rib_${r}_${s}`,
                        fromX: fromX,
                        fromY: ribY,
                        toX: toX,
                        toY: ribY,
                        width: 1,
                        isSpine: false
                    });

                    // Add leaf sockets along ribs
                    const ribLength = toX - fromX;
                    const leafCount = Math.floor(ribLength / 5);
                    for (let l = 1; l <= leafCount; l++) {
                        const leafX = fromX + Math.floor(ribLength * (l / (leafCount + 1)));
                        const direction = this.rng.chance(0.5) ? 'top' : 'bottom';

                        leaves.push({
                            id: `leaf_rib_${r}_${s}_${l}`,
                            type: 'leaf',
                            x: leafX,
                            y: ribY,
                            direction: direction as any,
                            suggestedWidth: 3,
                            suggestedHeight: 3
                        });
                    }
                }

                // Create junction at rib intersections
                for (const spineX of spineXPositions) {
                    junctions.push({
                        id: `junc_rib_${r}_spine_${spineX}`,
                        x: spineX * CELL_SIZE,
                        y: ribY * CELL_SIZE,
                        connectorIds: [],
                        type: 'cross'
                    });
                }
            }
        } else {
            // Single spine - add leaf sockets along it
            const leafCount = Math.floor(spineHeight / 4);
            for (let l = 1; l <= leafCount; l++) {
                const leafY = spineStartY + Math.floor(spineHeight * (l / (leafCount + 1)));
                const direction = this.rng.chance(0.5) ? 'left' : 'right';

                leaves.push({
                    id: `leaf_spine_${l}`,
                    type: 'leaf',
                    x: spineXPositions[0],
                    y: leafY,
                    direction: direction as any,
                    suggestedWidth: 3,
                    suggestedHeight: 3
                });
            }
        }

        return { segments, hubs, leaves, junctions };
    }

    private getHubTypesForPosition(index: number, total: number, isMain: boolean): string[] {
        if (isMain) {
            if (index === 0) return ['medbay', 'infirmary', 'commonArea'];
            if (index === total - 1) return ['cargoBay', 'cargo', 'hangar'];
            return ['commonArea', 'messHall', 'lounge'];
        } else {
            if (index === 0) return ['armory', 'security'];
            return ['storage', 'cargo', 'utility'];
        }
    }

    // ========================================================================
    // STATION SKELETON (Ring-based)
    // ========================================================================

    private generateStationSkeleton(width: number, height: number, ringCount: number): SkeletonV2Result {
        const segments: CorridorSegment[] = [];
        const hubs: HubSocket[] = [];
        const leaves: LeafSocket[] = [];
        const junctions: Junction[] = [];

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);
        const maxRadius = Math.min(width, height) * 0.4;

        // Central hub
        hubs.push({
            id: 'hub_center',
            type: 'hub',
            x: centerX,
            y: centerY,
            corridorId: 'center',
            preferredTypes: ['command', 'bridge', 'operations'],
            entryDirection: 'top',
            exitDirection: 'bottom',
            suggestedWidth: 6,
            suggestedHeight: 6
        });

        // Create rings with hubs at cardinal points
        for (let r = 1; r <= ringCount; r++) {
            const radius = Math.floor(maxRadius * (r / ringCount));
            const spokeCount = 4 + r * 2; // More spokes for outer rings

            for (let s = 0; s < spokeCount; s++) {
                const angle = (s / spokeCount) * Math.PI * 2;
                const x = centerX + Math.floor(Math.cos(angle) * radius);
                const y = centerY + Math.floor(Math.sin(angle) * radius);

                // Hub at cardinal directions
                if (s % Math.floor(spokeCount / 4) === 0) {
                    hubs.push({
                        id: `hub_ring_${r}_${s}`,
                        type: 'hub',
                        x: x,
                        y: y,
                        corridorId: `ring_${r}`,
                        preferredTypes: r === 1 ? ['medbay', 'engineering'] : ['cargo', 'storage'],
                        entryDirection: 'left',
                        exitDirection: 'right',
                        suggestedWidth: 4,
                        suggestedHeight: 4
                    });
                } else {
                    // Leaf sockets between hubs
                    leaves.push({
                        id: `leaf_ring_${r}_${s}`,
                        type: 'leaf',
                        x: x,
                        y: y,
                        direction: angle < Math.PI ? 'bottom' : 'top',
                        suggestedWidth: 3,
                        suggestedHeight: 3
                    });
                }
            }

            // Spokes connecting to center
            for (let s = 0; s < 4; s++) {
                const angle = (s / 4) * Math.PI * 2;
                const outerX = centerX + Math.floor(Math.cos(angle) * radius);
                const outerY = centerY + Math.floor(Math.sin(angle) * radius);

                if (r === 1) {
                    // Connect to center
                    segments.push({
                        id: `spoke_${r}_${s}`,
                        fromX: centerX,
                        fromY: centerY,
                        toX: outerX,
                        toY: outerY,
                        width: 2,
                        isSpine: true
                    });
                } else {
                    // Connect to inner ring
                    const innerRadius = Math.floor(maxRadius * ((r - 1) / ringCount));
                    const innerX = centerX + Math.floor(Math.cos(angle) * innerRadius);
                    const innerY = centerY + Math.floor(Math.sin(angle) * innerRadius);

                    segments.push({
                        id: `spoke_${r}_${s}`,
                        fromX: innerX,
                        fromY: innerY,
                        toX: outerX,
                        toY: outerY,
                        width: 1,
                        isSpine: false
                    });
                }
            }
        }

        return { segments, hubs, leaves, junctions };
    }

    // ========================================================================
    // OUTPOST SKELETON (Cluster-based)
    // ========================================================================

    private generateOutpostSkeleton(width: number, height: number): SkeletonV2Result {
        const segments: CorridorSegment[] = [];
        const hubs: HubSocket[] = [];
        const leaves: LeafSocket[] = [];
        const junctions: Junction[] = [];

        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Central hub
        hubs.push({
            id: 'hub_main',
            type: 'hub',
            x: centerX,
            y: centerY,
            corridorId: 'center',
            preferredTypes: ['command', 'operations', 'commonArea'],
            entryDirection: 'top',
            exitDirection: 'bottom',
            suggestedWidth: 5,
            suggestedHeight: 5
        });

        // Generate satellite hubs
        const satelliteCount = this.rng.randomInt(3, 5);
        const usedAngles: number[] = [];

        for (let i = 0; i < satelliteCount; i++) {
            // Find unused angle
            let angle: number;
            do {
                angle = this.rng.random() * Math.PI * 2;
            } while (usedAngles.some(a => Math.abs(a - angle) < 0.8));
            usedAngles.push(angle);

            const distance = this.rng.randomInt(8, 15);
            const x = centerX + Math.floor(Math.cos(angle) * distance);
            const y = centerY + Math.floor(Math.sin(angle) * distance);

            hubs.push({
                id: `hub_satellite_${i}`,
                type: 'hub',
                x: x,
                y: y,
                corridorId: `connector_${i}`,
                preferredTypes: ['cargo', 'engineering', 'quarters', 'lab'],
                entryDirection: this.getOppositeDirection(angle),
                exitDirection: this.getOppositeDirection(angle),
                suggestedWidth: 4,
                suggestedHeight: 4
            });

            // Connect to center
            segments.push({
                id: `connector_${i}`,
                fromX: centerX,
                fromY: centerY,
                toX: x,
                toY: y,
                width: 1,
                isSpine: true
            });

            // Add leaf sockets around satellite
            const leafDir = this.rng.chance(0.5) ? 'left' : 'right';
            leaves.push({
                id: `leaf_satellite_${i}`,
                type: 'leaf',
                x: x + (leafDir === 'left' ? -2 : 2),
                y: y,
                direction: leafDir as any,
                suggestedWidth: 2,
                suggestedHeight: 2
            });
        }

        return { segments, hubs, leaves, junctions };
    }

    private getOppositeDirection(angle: number): 'top' | 'bottom' | 'left' | 'right' {
        const deg = (angle * 180 / Math.PI + 360) % 360;
        if (deg >= 315 || deg < 45) return 'left';
        if (deg >= 45 && deg < 135) return 'top';
        if (deg >= 135 && deg < 225) return 'right';
        return 'bottom';
    }

    // ========================================================================
    // ROOM PLACEMENT
    // ========================================================================

    /**
     * Place rooms on the skeleton
     * Returns placed rooms and updated connectors
     */
    placeRooms(
        skeleton: SkeletonV2Result,
        program: { rooms: any[] }
    ): { rooms: LayoutRoom[]; connectors: LayoutConnector[] } {
        const rooms: LayoutRoom[] = [];
        const connectors: LayoutConnector[] = [];
        const placedHubs: PlacedHub[] = [];

        // Separate rooms by type
        const hubRooms = program.rooms.filter(r =>
            HUB_ROOM_TYPES.some(t => r.roomType?.toLowerCase().includes(t.toLowerCase()))
        );
        const leafRooms = program.rooms.filter(r =>
            !hubRooms.includes(r)
        );

        console.log(`[SkeletonV2] Placing ${hubRooms.length} hub rooms, ${leafRooms.length} leaf rooms`);
        console.log(`[SkeletonV2] Available: ${skeleton.hubs.length} hub sockets, ${skeleton.leaves.length} leaf sockets`);

        // 1. Place Hub Rooms (on skeleton path)
        const shuffledHubs = this.rng.shuffle([...skeleton.hubs]);
        for (const hubSocket of shuffledHubs) {
            // Find matching room
            const matchingRoom = hubRooms.find(r =>
                hubSocket.preferredTypes.some(pt =>
                    r.roomType?.toLowerCase().includes(pt.toLowerCase()) ||
                    r.label?.toLowerCase().includes(pt.toLowerCase())
                )
            );

            const roomToPlace = matchingRoom || hubRooms[0];
            if (!roomToPlace) continue;

            // Place room at hub position
            const room = this.createHubRoom(roomToPlace, hubSocket);

            // Check collision with existing rooms
            if (!this.checkCollision(room, rooms)) {
                rooms.push(room);
                placedHubs.push({ socket: hubSocket, room });

                // Remove from available
                const idx = hubRooms.indexOf(roomToPlace);
                if (idx > -1) hubRooms.splice(idx, 1);
            }
        }

        // 2. Place Leaf Rooms (on sides)
        const shuffledLeaves = this.rng.shuffle([...skeleton.leaves]);
        for (const leafSocket of shuffledLeaves) {
            if (leafRooms.length === 0) break;

            const roomToPlace = leafRooms[0];
            const room = this.createLeafRoom(roomToPlace, leafSocket);

            if (!this.checkCollision(room, rooms)) {
                rooms.push(room);
                leafRooms.shift();
            }
        }

        // 3. Generate connectors based on placed hubs
        // Connectors pass THROUGH hub rooms
        for (const segment of skeleton.segments) {
            const segmentConnectors = this.createConnectorsForSegment(segment, placedHubs, rooms);
            connectors.push(...segmentConnectors);
        }

        // 4. Connect leaf rooms to nearest corridor
        for (const room of rooms) {
            if (!placedHubs.some(ph => ph.room.id === room.id)) {
                // This is a leaf room - connect to nearest point
                const connector = this.createLeafConnector(room, connectors, rooms);
                if (connector) {
                    connectors.push(connector);
                }
            }
        }

        return { rooms, connectors };
    }

    private createHubRoom(programRoom: any, socket: HubSocket): LayoutRoom {
        const w = socket.suggestedWidth;
        const h = socket.suggestedHeight;

        // Center room on socket
        const x = socket.x - Math.floor(w / 2);
        const y = socket.y - Math.floor(h / 2);

        // Create ports for entry and exit
        const ports: Port[] = [];

        // Entry port
        const entryPort = this.createPortOnWall(socket.entryDirection, x, y, w, h, `port_${programRoom.id}_entry`);
        ports.push(entryPort);

        // Exit port (if different from entry)
        if (socket.exitDirection !== socket.entryDirection) {
            const exitPort = this.createPortOnWall(socket.exitDirection, x, y, w, h, `port_${programRoom.id}_exit`);
            ports.push(exitPort);
        }

        return {
            id: programRoom.id,
            roomType: programRoom.roomType,
            label: programRoom.label || programRoom.id,
            x: x * CELL_SIZE,
            y: y * CELL_SIZE,
            width: w * CELL_SIZE,
            height: h * CELL_SIZE,
            gridX: x,
            gridY: y,
            gridWidth: w,
            gridHeight: h,
            zone: programRoom.zone || 'default',
            ports,
            isExterior: false
        };
    }

    private createLeafRoom(programRoom: any, socket: LeafSocket): LayoutRoom {
        const w = programRoom.estimatedWidth || socket.suggestedWidth;
        const h = programRoom.estimatedHeight || socket.suggestedHeight;

        let x = socket.x;
        let y = socket.y;
        let portWall: 'top' | 'bottom' | 'left' | 'right';

        // Position room based on direction
        switch (socket.direction) {
            case 'top':
                y = socket.y - h - 1;
                portWall = 'bottom';
                x = socket.x - Math.floor(w / 2);
                break;
            case 'bottom':
                y = socket.y + 2;
                portWall = 'top';
                x = socket.x - Math.floor(w / 2);
                break;
            case 'left':
                x = socket.x - w - 1;
                portWall = 'right';
                y = socket.y - Math.floor(h / 2);
                break;
            case 'right':
                x = socket.x + 2;
                portWall = 'left';
                y = socket.y - Math.floor(h / 2);
                break;
        }

        const port = this.createPortOnWall(portWall, x, y, w, h, `port_${programRoom.id}_main`);

        return {
            id: programRoom.id,
            roomType: programRoom.roomType,
            label: programRoom.label || programRoom.id,
            x: x * CELL_SIZE,
            y: y * CELL_SIZE,
            width: w * CELL_SIZE,
            height: h * CELL_SIZE,
            gridX: x,
            gridY: y,
            gridWidth: w,
            gridHeight: h,
            zone: programRoom.zone || 'default',
            ports: [port],
            isExterior: false
        };
    }

    private createPortOnWall(
        wall: 'top' | 'bottom' | 'left' | 'right',
        x: number, y: number, w: number, h: number,
        portId: string
    ): Port {
        let px: number, py: number;

        switch (wall) {
            case 'top':
                px = (x + w / 2) * CELL_SIZE;
                py = y * CELL_SIZE;
                break;
            case 'bottom':
                px = (x + w / 2) * CELL_SIZE;
                py = (y + h) * CELL_SIZE;
                break;
            case 'left':
                px = x * CELL_SIZE;
                py = (y + h / 2) * CELL_SIZE;
                break;
            case 'right':
                px = (x + w) * CELL_SIZE;
                py = (y + h / 2) * CELL_SIZE;
                break;
        }

        return {
            id: portId,
            x: px,
            y: py,
            wall,
            connectorId: ''
        };
    }

    private createConnectorsForSegment(
        segment: CorridorSegment,
        placedHubs: PlacedHub[],
        allRooms: LayoutRoom[]
    ): LayoutConnector[] {
        const connectors: LayoutConnector[] = [];

        // Find hubs that this segment connects through
        const hubsOnSegment = placedHubs.filter(ph => {
            const hx = ph.socket.x;
            const hy = ph.socket.y;

            // Check if hub is on this segment
            if (segment.fromX === segment.toX) {
                // Vertical segment
                return hx === segment.fromX &&
                    hy >= Math.min(segment.fromY, segment.toY) &&
                    hy <= Math.max(segment.fromY, segment.toY);
            } else {
                // Horizontal segment
                return hy === segment.fromY &&
                    hx >= Math.min(segment.fromX, segment.toX) &&
                    hx <= Math.max(segment.fromX, segment.toX);
            }
        });

        // Sort hubs by position along segment
        hubsOnSegment.sort((a, b) => {
            if (segment.fromX === segment.toX) {
                return a.socket.y - b.socket.y;
            } else {
                return a.socket.x - b.socket.x;
            }
        });

        // Create corridor path, going through hubs
        const path: Point[] = [];
        let currentX = segment.fromX * CELL_SIZE;
        let currentY = segment.fromY * CELL_SIZE;

        path.push({ x: currentX, y: currentY });

        // For now, simple straight segment (hubs will be "part of" the corridor visually)
        path.push({ x: segment.toX * CELL_SIZE, y: segment.toY * CELL_SIZE });

        connectors.push({
            id: segment.id,
            fromRoomId: hubsOnSegment.length > 0 ? hubsOnSegment[0].room.id : '',
            toRoomId: hubsOnSegment.length > 1 ? hubsOnSegment[hubsOnSegment.length - 1].room.id : '',
            kind: 'corridor',
            path,
            width: segment.width * CELL_SIZE
        });

        return connectors;
    }

    private createLeafConnector(
        room: LayoutRoom,
        existingConnectors: LayoutConnector[],
        allRooms: LayoutRoom[]
    ): LayoutConnector | null {
        // Find room's port
        if (room.ports.length === 0) return null;

        const port = room.ports[0];

        // Find nearest corridor
        let nearestConnector: LayoutConnector | null = null;
        let nearestDistance = Infinity;
        let nearestPoint: Point | null = null;

        for (const conn of existingConnectors) {
            for (const pathPoint of conn.path) {
                const dist = Math.abs(pathPoint.x - port.x) + Math.abs(pathPoint.y - port.y);
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestConnector = conn;
                    nearestPoint = pathPoint;
                }
            }
        }

        if (!nearestPoint || nearestDistance > 400) return null;

        // Create L-shaped path
        const path: Point[] = [
            { x: port.x, y: port.y }
        ];

        // Go horizontal first, then vertical
        if (Math.abs(nearestPoint.x - port.x) > Math.abs(nearestPoint.y - port.y)) {
            path.push({ x: nearestPoint.x, y: port.y });
            path.push({ x: nearestPoint.x, y: nearestPoint.y });
        } else {
            path.push({ x: port.x, y: nearestPoint.y });
            path.push({ x: nearestPoint.x, y: nearestPoint.y });
        }

        return {
            id: `conn_leaf_${room.id}`,
            fromRoomId: room.id,
            toRoomId: nearestConnector?.fromRoomId || '',
            kind: 'corridor',
            path,
            width: CELL_SIZE
        };
    }

    private checkCollision(room: LayoutRoom, existingRooms: LayoutRoom[]): boolean {
        const padding = 1; // 1 grid cell padding

        for (const other of existingRooms) {
            if (room.gridX < other.gridX + other.gridWidth + padding &&
                room.gridX + room.gridWidth + padding > other.gridX &&
                room.gridY < other.gridY + other.gridHeight + padding &&
                room.gridY + room.gridHeight + padding > other.gridY) {
                return true;
            }
        }
        return false;
    }
}

// ============================================================================
// ADAPTER FUNCTION
// ============================================================================

/**
 * Adapter to use SkeletonGeneratorV2 in the main pipeline
 */
export function generateSkeletonLayoutV2(options: LayoutOptions): DeckLayout[] {
    const { request, topology } = options;
    const rng = createRNG(request.seed + '-skeletonV2');

    const generator = new SkeletonGeneratorV2(rng);

    // Calculate grid size
    const totalTiles = topology.rooms.reduce((sum, r) => sum + r.estimatedTiles, 0);
    const gridDimension = Math.ceil(Math.sqrt(totalTiles * 4.0)); // Extra space for hubs
    const gridWidth = Math.max(40, gridDimension);
    const gridHeight = Math.max(40, gridDimension);

    // Generate skeleton
    const skeleton = generator.generate(request, gridWidth, gridHeight);

    // Place rooms
    const placementProgram = { rooms: [...topology.rooms] };
    const { rooms, connectors } = generator.placeRooms(skeleton, placementProgram);

    // Create junctions at corridor intersections
    const junctions = skeleton.junctions;

    const layout: DeckLayout = {
        deckIndex: 0,
        gridWidth,
        gridHeight,
        rooms,
        connectors,
        junctions
    };

    return [layout];
}
