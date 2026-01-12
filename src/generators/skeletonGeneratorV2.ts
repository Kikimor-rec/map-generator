/**
 * SkeletonGenerator V2 - SIMPLIFIED ROBUST VERSION
 * 
 * Strategy:
 * 1. Direct Grid Manipulation (No abstract sockets)
 * 2. Strict Integer Coordinates
 * 3. Immediate Corridor rasterization
 * 4. A* Intelligent Routing
 */

import {
    DeckLayout,
    LayoutConnector,
    LayoutRoom,
    Junction,
    Port,
    Point,
    GenerationRequest,
    SeededRNG
} from './types';
import { createRNG } from './rng';
import { LayoutOptions } from './layout';

// ============================================================================
// CONFIG
// ============================================================================

const CELL_SIZE = 40;
const SPINE_WIDTH = 24;
const LEAF_WIDTH = 16;

// A* Costs
const COST_EMPTY = 5;
const COST_CORRIDOR = 1;
const COST_ROOM_BUFFER = 20;
const COST_ROOM_INTERIOR = 200;
const COST_WALL = 1000;

interface AStarNode {
    x: number;
    y: number;
    g: number;
    h: number;
    parent: AStarNode | null;
}

/**
 * Robust Grid-Based Skeleton Generator
 * Supports: 'ship' (Spine/Ribs) and 'station' (Hub/Wheel)
 */
export class SkeletonGeneratorV2 {
    private rng: SeededRNG;
    private gridWidth: number = 0;
    private gridHeight: number = 0;

    // Grid state (0=Empty, 1=Room, 2=Corridor)
    private grid: number[][] = [];

    constructor(rng: SeededRNG) {
        this.rng = rng;
    }

    // ========================================================================
    // JUNCTIONS AND CLEANUP
    // ========================================================================

    private detectJunctions(connectors: LayoutConnector[]): Junction[] {
        const junctions: Junction[] = [];
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.grid[y][x] === 2) { // Is corridor
                    let neighbors = 0;
                    const connectedConnectorIds: string[] = [];

                    // Check cardinality
                    for (const [dx, dy] of directions) {
                        if (this.isValid(x + dx, y + dy) && (this.grid[y + dy][x + dx] === 2 || this.grid[y + dy][x + dx] === 1)) {
                            neighbors++;
                        }
                    }

                    if (neighbors >= 3) {
                        // It's a junction!
                        junctions.push({
                            id: `jnc_${x}_${y}`,
                            x: x * CELL_SIZE,
                            y: y * CELL_SIZE,
                            connectorIds: [], // To be populated if we split segments
                            type: neighbors === 4 ? 'cross' : 'tee'
                        });
                    }
                }
            }
        }
        return junctions;
    }

    private splitConnectorsAtJunctions(connectors: LayoutConnector[], junctions: Junction[]): LayoutConnector[] {
        const newConnectors: LayoutConnector[] = [];
        const junctionMap = new Map<string, string>();
        junctions.forEach(j => junctionMap.set(`${j.x},${j.y}`, j.id));

        for (const conn of connectors) {
            const segments: Point[][] = [];
            const splitIds: string[] = [];
            let segmentStart = 0;

            for (let i = 0; i < conn.path.length; i++) {
                const p = conn.path[i];
                const key = `${p.x},${p.y}`;
                const jId = junctionMap.get(key);

                // Split if we hit a junction in the middle of the path
                if (jId && i > 0 && i < conn.path.length - 1) {
                    segments.push(conn.path.slice(segmentStart, i + 1));
                    splitIds.push(jId);
                    segmentStart = i;
                }
            }
            segments.push(conn.path.slice(segmentStart));

            if (segments.length === 1) {
                newConnectors.push(conn);
            } else {
                let fromId = conn.fromRoomId;
                for (let k = 0; k < segments.length; k++) {
                    const toId = (k < splitIds.length) ? splitIds[k] : conn.toRoomId;
                    const segId = `${conn.id}_s${k}`;

                    newConnectors.push({
                        id: segId,
                        fromRoomId: fromId,
                        toRoomId: toId,
                        kind: conn.kind,
                        path: segments[k],
                        width: conn.width,
                        widthClass: conn.widthClass || 'standard'
                    });

                    // Update junction references
                    if (fromId.startsWith('jnc_')) {
                        const j = junctions.find(j => j.id === fromId);
                        if (j && !j.connectorIds.includes(segId)) j.connectorIds.push(segId);
                    }
                    if (toId.startsWith('jnc_')) {
                        const j = junctions.find(j => j.id === toId);
                        if (j && !j.connectorIds.includes(segId)) j.connectorIds.push(segId);
                    }

                    fromId = toId;
                }
            }
        }
        return newConnectors;
    }

    public generate(options: LayoutOptions): DeckLayout[] {
        // Defensive Input Handling
        const request = (options.request as any) || { seed: '0', mapParams: {} };
        const mapParams = request.mapParams || {};
        const topology = options.topology || { rooms: [], edges: [] };

        // Try getting archetype from direct prop (hack) or mapParams
        const archetype = (request.archetype || mapParams.archetype || 'ship').toLowerCase();

        // 1. Initialize Grid
        const safeRooms = topology.rooms || [];
        const totalTiles = safeRooms.reduce((s: number, r: any) => {
            const w = r.targetSize?.width || 4;
            const h = r.targetSize?.height || 4;
            return s + (w * h);
        }, 0);

        // Compact grid
        const dimension = Math.max(60, Math.ceil(Math.sqrt(totalTiles * 5) + 20));
        this.gridWidth = dimension;
        this.gridHeight = dimension;
        this.grid = Array(this.gridHeight).fill(0).map(() => Array(this.gridWidth).fill(0));

        const rooms: LayoutRoom[] = [];
        const connectors: LayoutConnector[] = [];

        console.log(`[SkeletonV2] Generating ${archetype} on ${this.gridWidth}x${this.gridHeight} (Input Tiles: ${totalTiles})`);

        if (archetype === 'station') {
            this.generateStationLayout(topology, rooms, connectors);
        } else {
            this.generateShipLayout(topology, rooms, connectors);
        }

        const junctions = this.detectJunctions(connectors);
        const splitConnectors = this.splitConnectorsAtJunctions(connectors, junctions);

        console.log(`[SkeletonV2] Generated ${rooms.length} rooms, ${splitConnectors.length} connectors (split), ${junctions.length} junctions`);

        return [{
            deckIndex: 0,
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            rooms: rooms,
            connectors: splitConnectors,
            junctions: junctions
        }];
    }

    // ========================================================================
    // PATHFINDING (A*)
    // ========================================================================

    private findSmartPath(px1: number, py1: number, px2: number, py2: number): Point[] {
        const x1 = Math.round(px1 / CELL_SIZE);
        const y1 = Math.round(py1 / CELL_SIZE);
        const x2 = Math.round(px2 / CELL_SIZE);
        const y2 = Math.round(py2 / CELL_SIZE);

        const costs = this.createCostGrid();

        // Ensure Start/End are passable
        if (this.isValid(x1, y1)) costs[y1][x1] = COST_CORRIDOR;
        if (this.isValid(x2, y2)) costs[y2][x2] = COST_CORRIDOR;

        const openSet: AStarNode[] = [];
        const closedSet = new Set<string>();

        const startNode: AStarNode = { x: x1, y: y1, g: 0, h: this.heuristic(x1, y1, x2, y2), parent: null };
        openSet.push(startNode);

        while (openSet.length > 0) {
            openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
            const current = openSet.shift()!;

            if (current.x === x2 && current.y === y2) {
                return this.reconstructPath(current);
            }

            const key = `${current.x},${current.y}`;
            if (closedSet.has(key)) continue;
            closedSet.add(key);

            const neighbors = [
                { x: current.x, y: current.y - 1 },
                { x: current.x, y: current.y + 1 },
                { x: current.x - 1, y: current.y },
                { x: current.x + 1, y: current.y }
            ];

            for (const n of neighbors) {
                if (!this.isValid(n.x, n.y)) continue;
                if (closedSet.has(`${n.x},${n.y}`)) continue;

                const cost = costs[n.y][n.x];
                if (cost >= COST_WALL) continue;

                const gScore = current.g + cost;

                const existing = openSet.find(o => o.x === n.x && o.y === n.y);
                if (existing) {
                    if (gScore < existing.g) {
                        existing.g = gScore;
                        existing.parent = current;
                    }
                } else {
                    openSet.push({
                        x: n.x, y: n.y,
                        g: gScore,
                        h: this.heuristic(n.x, n.y, x2, y2),
                        parent: current
                    });
                }
            }
        }

        console.warn(`[SkeletonV2] A* failed from ${x1},${y1} to ${x2},${y2}. Falling back to L-Path.`);
        // Mark grid anyway for visual debug if needed
        // this.drawPathOnGrid(fallbackPath);
        return this.createLPath(px1, py1, px2, py2);
    }

    private heuristic(x1: number, y1: number, x2: number, y2: number): number {
        return (Math.abs(x1 - x2) + Math.abs(y1 - y2)) * COST_EMPTY;
    }

    private reconstructPath(node: AStarNode): Point[] {
        const path: Point[] = [];
        let curr: AStarNode | null = node;
        while (curr) {
            path.push({ x: curr.x * CELL_SIZE, y: curr.y * CELL_SIZE });
            if (this.isValid(curr.x, curr.y)) {
                this.grid[curr.y][curr.x] = 2; // Mark as corridor on global grid
            }
            curr = curr.parent;
        }
        return path.reverse();
    }

    private createCostGrid(): number[][] {
        const costs = Array(this.gridHeight).fill(0).map(() => Array(this.gridWidth).fill(COST_EMPTY));

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const val = this.grid[y][x];
                if (val === 1) costs[y][x] = COST_ROOM_INTERIOR;
                else if (val === 2) costs[y][x] = COST_CORRIDOR;
            }
        }

        // Add Buffer Zones
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                if (this.grid[y][x] === 1) {
                    // Mark neighbors
                    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
                    for (const [dx, dy] of dirs) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (this.isValid(nx, ny) && costs[ny][nx] === COST_EMPTY) {
                            costs[ny][nx] = COST_ROOM_BUFFER;
                        }
                    }
                }
            }
        }
        return costs;
    }

    private isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    // ========================================================================
    // SHIP LAYOUT
    // ========================================================================

    private generateShipLayout(topology: any, rooms: LayoutRoom[], connectors: LayoutConnector[]) {
        const safeRooms = topology.rooms || [];

        const hubTypes = ['bridge', 'engineering', 'medbay', 'cargo', 'hangar'];
        const hubRooms = safeRooms.filter((r: any) => hubTypes.some((t: string) => r.roomType?.toLowerCase().includes(t)));
        const leafRooms = safeRooms.filter((r: any) => !hubRooms.includes(r));

        const centerX = Math.floor(this.gridWidth / 2);
        let currentY = Math.floor(this.gridHeight * 0.1);

        const bridge = hubRooms.find((r: any) => r.roomType === 'bridge' || r.roomType === 'cockpit');
        const engine = hubRooms.find((r: any) => r.roomType === 'engineering' || r.roomType === 'reactor');
        const bufferHubs = hubRooms.filter((r: any) => r !== bridge && r !== engine);

        const orderedHubs = [bridge, ...bufferHubs, engine].filter((r: any) => r !== undefined);

        const spinePoints: { x: number, y: number }[] = [];

        // Place Hubs
        for (const roomData of orderedHubs) {
            const rw = this.getRoomDim(roomData, 'width');
            const rh = this.getRoomDim(roomData, 'height');

            const x = centerX - Math.floor(rw / 2);
            const y = currentY;

            this.occupyGrid(x, y, rw, rh, 1);
            const ports = this.createPorts(roomData.id, x, y, rw, rh, roomData);

            rooms.push(this.createRoom(roomData, x, y, rw, rh, ports));

            // Mark spine occupancy
            for (let py = y; py < y + rh; py++) {
                if (py < this.gridHeight) spinePoints.push({ x: centerX, y: py });
            }

            currentY += rh + 2;
        }

        // Connect Hubs (Spine)
        if (rooms.length > 1) {
            for (let i = 0; i < rooms.length - 1; i++) {
                const r1 = rooms[i];
                const r2 = rooms[i + 1];

                // Spine is simple, use specialized V-path to avoid cost grid if we want straight spine
                // But let's try A* too, it should prefer the straight line if empty
                const p1 = this.getBestPort(r1, r2.x, r2.y); // Bottom of r1
                const p2 = this.getBestPort(r2, p1.x, p1.y); // Top of r2

                const path = this.findSmartPath(p1.x, p1.y, p2.x, p2.y);

                connectors.push({
                    id: `spine_${i}`,
                    fromRoomId: r1.id,
                    toRoomId: r2.id,
                    kind: 'corridor',
                    path: path,
                    width: SPINE_WIDTH,
                    widthClass: 'wide'
                });
            }
        }

        // Place Leaves
        let side = -1;
        let leafYIndex = 0;
        const leafSlots = spinePoints.filter((_, i) => i % 2 === 1);
        if (leafSlots.length === 0 && spinePoints.length > 0) leafSlots.push(...spinePoints);

        for (const roomData of leafRooms) {
            if (leafSlots.length === 0) break;
            const slot = leafSlots[leafYIndex % leafSlots.length];
            leafYIndex++;

            const rw = this.getRoomDim(roomData, 'width');
            const rh = this.getRoomDim(roomData, 'height');

            const gap = 2; // Increase gap for corridor maneuvering
            let x = 0;
            let portWall: 'left' | 'right';

            if (side === -1) {
                x = slot.x - gap - rw;
                portWall = 'right';
            } else {
                x = slot.x + gap + 1;
                portWall = 'left';
            }
            const y = slot.y - Math.floor(rh / 2);

            if (!this.isValid(x, y) || !this.isValid(x + rw, y + rh)) continue;

            this.occupyGrid(x, y, rw, rh, 1);
            const portX = (side === -1) ? (x + rw) : x;
            const portY = slot.y;

            const port: Port = {
                id: `${roomData.id}_gate`,
                x: portX * CELL_SIZE,
                y: portY * CELL_SIZE,
                wall: portWall,
                connectorId: '',
                doorType: this.determineDoorType(roomData)
            };

            rooms.push(this.createRoom(roomData, x, y, rw, rh, [port]));

            // Connect to Spine
            const path = this.findSmartPath(portX * CELL_SIZE, portY * CELL_SIZE, slot.x * CELL_SIZE, slot.y * CELL_SIZE);
            connectors.push({
                id: `conn_${roomData.id}`,
                fromRoomId: roomData.id,
                toRoomId: '',
                kind: 'corridor',
                path: path,
                width: LEAF_WIDTH,
                widthClass: 'standard'
            });

            side *= -1;
        }
    }

    // ========================================================================
    // STATION LAYOUT
    // ========================================================================

    private generateStationLayout(topology: any, rooms: LayoutRoom[], connectors: LayoutConnector[]) {
        const cx = Math.floor(this.gridWidth / 2);
        const cy = Math.floor(this.gridHeight / 2);
        const safeRooms = topology.rooms || [];
        const hubTypes = ['bridge', 'engineering', 'medbay', 'cargo', 'hangar', 'reactor'];
        const hubRooms = safeRooms.filter((r: any) => hubTypes.some((t: string) => r.roomType?.toLowerCase().includes(t)));
        const leafRooms = safeRooms.filter((r: any) => !hubRooms.includes(r));

        console.log(`[SkeletonV2] Station: ${hubRooms.length} Hubs, ${leafRooms.length} Leaves`);

        const centerRoomData = hubRooms.find((r: any) => ['reactor', 'command', 'bridge'].some((t: string) => r.roomType?.includes(t))) || hubRooms[0];
        const ringHubs = hubRooms.filter((r: any) => r !== centerRoomData);

        let centerRoom: LayoutRoom | undefined;

        if (centerRoomData) {
            const rw = this.getRoomDim(centerRoomData, 'width') + 2;
            const rh = this.getRoomDim(centerRoomData, 'height') + 2;
            const x = cx - Math.floor(rw / 2);
            const y = cy - Math.floor(rh / 2);
            this.occupyGrid(x, y, rw, rh, 1);
            const ports = this.createPorts(centerRoomData.id, x, y, rw, rh, centerRoomData);
            centerRoom = this.createRoom(centerRoomData, x, y, rw, rh, ports);
            rooms.push(centerRoom);
        }

        const radius = Math.max(12, ringHubs.length * 4);
        const angleStep = ringHubs.length > 0 ? (2 * Math.PI) / ringHubs.length : 0;

        ringHubs.forEach((roomData: any, i: number) => {
            const angle = i * angleStep;
            const rCenterGridX = cx + Math.floor(Math.cos(angle) * radius);
            const rCenterGridY = cy + Math.floor(Math.sin(angle) * radius);
            const rw = this.getRoomDim(roomData, 'width');
            const rh = this.getRoomDim(roomData, 'height');
            const x = rCenterGridX - Math.floor(rw / 2);
            const y = rCenterGridY - Math.floor(rh / 2);

            this.occupyGrid(x, y, rw, rh, 1);
            const ports = this.createPorts(roomData.id, x, y, rw, rh, roomData);
            const hubRoom = this.createRoom(roomData, x, y, rw, rh, ports);
            rooms.push(hubRoom);

            if (centerRoom) {
                const startPort = this.getBestPort(centerRoom, hubRoom.x + hubRoom.width / 2, hubRoom.y + hubRoom.height / 2);
                const endPort = this.getBestPort(hubRoom, centerRoom.x + centerRoom.width / 2, centerRoom.y + centerRoom.height / 2);

                const path = this.findSmartPath(startPort.x, startPort.y, endPort.x, endPort.y);
                connectors.push({
                    id: `spoke_${i}`,
                    fromRoomId: centerRoomData.id,
                    toRoomId: roomData.id,
                    kind: 'corridor',
                    path: path,
                    width: SPINE_WIDTH,
                    widthClass: 'wide'
                });
            }
        });

        if (ringHubs.length > 1) {
            for (let i = 0; i < ringHubs.length; i++) {
                const r1 = rooms.find(r => r.id === ringHubs[i].id);
                const r2 = rooms.find(r => r.id === ringHubs[(i + 1) % ringHubs.length].id);
                if (r1 && r2) {
                    const startPort = this.getBestPort(r1, r2.x + r2.width / 2, r2.y + r2.height / 2);
                    const endPort = this.getBestPort(r2, r1.x + r1.width / 2, r1.y + r1.height / 2);

                    const path = this.findSmartPath(startPort.x, startPort.y, endPort.x, endPort.y);
                    connectors.push({
                        id: `ring_${i}`,
                        fromRoomId: r1.id,
                        toRoomId: r2.id,
                        kind: 'corridor',
                        path: path,
                        width: LEAF_WIDTH,
                        widthClass: 'standard'
                    });
                }
            }
        }

        const hosts = ringHubs.length > 0 ? ringHubs : (centerRoomData ? [centerRoomData] : []);
        const safeHosts = hosts.filter((h: any) => h !== undefined);
        let hostIndex = 0;

        for (const leaf of leafRooms) {
            if (safeHosts.length === 0) break;
            const hostHub = safeHosts[hostIndex % safeHosts.length];
            hostIndex++;

            const hostRoom = rooms.find(r => r.id === hostHub.id);
            if (!hostRoom) continue;

            const vx = (hostRoom.gridX + hostRoom.gridWidth / 2) - cx;
            const vy = (hostRoom.gridY + hostRoom.gridHeight / 2) - cy;
            let dist = Math.sqrt(vx * vx + vy * vy);
            let dirX = 0, dirY = 1;
            if (dist < 0.1) {
                const ang = (hostIndex * 1.5);
                dirX = Math.cos(ang);
                dirY = Math.sin(ang);
            } else {
                dirX = vx / dist;
                dirY = vy / dist;
            }

            const rw = this.getRoomDim(leaf, 'width');
            const rh = this.getRoomDim(leaf, 'height');
            const distance = 8;

            const leafCx = (hostRoom.gridX + hostRoom.gridWidth / 2) + Math.round(dirX * distance);
            const leafCy = (hostRoom.gridY + hostRoom.gridHeight / 2) + Math.round(dirY * distance);
            const x = leafCx - Math.floor(rw / 2);
            const y = leafCy - Math.floor(rh / 2);

            this.occupyGrid(x, y, rw, rh, 1);
            const ports = this.createPorts(leaf.id, x, y, rw, rh, leaf);
            const leafRoom = this.createRoom(leaf, x, y, rw, rh, ports);
            rooms.push(leafRoom);

            const startPort = this.getBestPort(hostRoom, leafRoom.x + leafRoom.width / 2, leafRoom.y + leafRoom.height / 2);
            const endPort = this.getBestPort(leafRoom, hostRoom.x + hostRoom.width / 2, hostRoom.y + hostRoom.height / 2);

            const path = this.findSmartPath(startPort.x, startPort.y, endPort.x, endPort.y);
            connectors.push({
                id: `leaf_cx_${leaf.id}`,
                fromRoomId: hostHub.id,
                toRoomId: leaf.id,
                kind: 'corridor',
                path: path,
                width: LEAF_WIDTH,
                widthClass: 'standard'
            });
        }
    }

    // ========================================================================
    // UTILS
    // ========================================================================

    private getRoomDim(data: any, prop: 'width' | 'height'): number {
        let val = 0;
        if (data.targetSize) val = data.targetSize[prop];
        else if (data.minSize) val = data.minSize[prop];
        else if (data.estimatedWidth && prop === 'width') val = data.estimatedWidth;
        if (!val || val < 2) return 4;
        return val;
    }

    private getBestPort(room: LayoutRoom, tx: number, ty: number): Port {
        const cx = room.x + room.width / 2;
        const cy = room.y + room.height / 2;
        const dx = tx - cx;
        const dy = ty - cy;
        let wall: 'top' | 'bottom' | 'left' | 'right' = 'top';
        if (Math.abs(dx) > Math.abs(dy)) wall = dx > 0 ? 'right' : 'left';
        else wall = dy > 0 ? 'bottom' : 'top';
        const port = room.ports.find(p => p.wall === wall);
        if (port) return port;
        return room.ports[0];
    }

    private determineDoorType(data: any): 'none' | 'standard' | 'secure' | 'bulkhead' | 'airlock' {
        if (data.isExterior) return 'airlock';
        if (data.accessLevel >= 3) return 'secure';
        // Special cases by type
        const type = (data.roomType || '').toLowerCase();
        if (type.includes('hangar') || type.includes('cargo') || type.includes('engineering')) return 'bulkhead';
        if (type.includes('bridge') || type.includes('armory') || type.includes('security')) return 'secure';

        return 'standard';
    }

    private createRoom(data: any, x: number, y: number, w: number, h: number, ports: Port[]): LayoutRoom {
        return {
            id: data.id,
            roomType: data.roomType || 'general',
            label: data.id,
            x: x * CELL_SIZE,
            y: y * CELL_SIZE,
            width: w * CELL_SIZE,
            height: h * CELL_SIZE,
            gridX: x, gridY: y,
            gridWidth: w, gridHeight: h,
            ports,
            zone: data.zone || 'general',
            isExterior: !!data.isExterior,
            tags: data.tags || []
        };
    }

    private createPorts(id: string, x: number, y: number, w: number, h: number, roomData?: any): Port[] {
        const doorType = roomData ? this.determineDoorType(roomData) : 'standard';
        return [
            { id: `${id}_t`, x: (x + w / 2) * CELL_SIZE, y: y * CELL_SIZE, wall: 'top', connectorId: '', doorType },
            { id: `${id}_b`, x: (x + w / 2) * CELL_SIZE, y: (y + h) * CELL_SIZE, wall: 'bottom', connectorId: '', doorType },
            { id: `${id}_l`, x: x * CELL_SIZE, y: (y + h / 2) * CELL_SIZE, wall: 'left', connectorId: '', doorType },
            { id: `${id}_r`, x: (x + w) * CELL_SIZE, y: (y + h / 2) * CELL_SIZE, wall: 'right', connectorId: '', doorType },
        ];
    }

    private occupyGrid(x: number, y: number, w: number, h: number, val: number) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (this.isValid(x + dx, y + dy)) {
                    this.grid[y + dy][x + dx] = val;
                }
            }
        }
    }

    private createLPath(px1: number, py1: number, px2: number, py2: number): Point[] {
        const path: Point[] = [];
        path.push({ x: px1, y: py1 });
        path.push({ x: px2, y: py1 });
        path.push({ x: px2, y: py2 });
        return path;
    }
}

export function generateSkeletonLayoutV2(options: LayoutOptions): DeckLayout[] {
    const generator = new SkeletonGeneratorV2(createRNG(options.request.seed));
    return generator.generate(options);
}
