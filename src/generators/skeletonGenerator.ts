import {
    DeckLayout,
    LayoutConnector,
    LayoutRoom,
    Junction,
    Socket,
    Port,
    Point,
    ConnectorKind,
    GenerationRequest,
    TopologyGraph,
    SeededRNG
} from './types';
import { createRNG } from './rng';
import { LayoutOptions } from './layout';

interface SkeletonResult {
    connectors: LayoutConnector[];
    junctions: Junction[];
    sockets: Socket[]; // Points where rooms can be attached
}


/**
 * Adapter to use SkeletonGenerator in the main pipeline
 */
export function generateSkeletonLayout(options: LayoutOptions): DeckLayout[] {
    const { request, topology } = options;
    const rng = createRNG(request.seed + '-skeleton');

    // For now, single deck
    const generator = new SkeletonGenerator(rng);

    // Calculate grid size based on room area
    const totalTiles = topology.rooms.reduce((sum, r) => sum + r.estimatedTiles, 0);
    const gridDimension = Math.ceil(Math.sqrt(totalTiles * 3.0)); // Larger multiplier for corridors
    const gridWidth = Math.max(30, gridDimension);
    const gridHeight = Math.max(30, gridDimension);

    const skeleton = generator.generate(request, gridWidth, gridHeight);

    // Treat topology.rooms as the "program"
    const placementProgram = { rooms: [...topology.rooms] };
    const placedRooms = generator.attachRooms(skeleton, placementProgram);

    // Convert skeleton connectors to LayoutConnectors explicitly if needed (already are)
    // Convert skeleton junctions to Layout Junctions (already are)

    const layout: DeckLayout = {
        deckIndex: 0,
        gridWidth,
        gridHeight,
        rooms: placedRooms,
        connectors: skeleton.connectors,
        junctions: skeleton.junctions
    };

    return [layout];
}

/**
 * SkeletonGenerator
 *
 * Generates the "Bones" of the ship first (Corridors), ensuring a logical
 * and navigable structure before rooms are even placed.
 */
export class SkeletonGenerator {
    private rng: SeededRNG;

    constructor(rng: SeededRNG) {
        this.rng = rng;
    }

    /**
     * Main entry point to generate a skeleton based on strategy
     */

    /**
     * Strategy D: concentric Rings (Space Station / Orbit)
     * Creates central hub, rings, and spokes.
     */
    private generateRingSkeleton(width: number, height: number): SkeletonResult {
        const connectors: LayoutConnector[] = [];
        const junctions: Junction[] = [];
        const sockets: Socket[] = [];

        const CELL_SIZE = 40;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 1. Central Hub
        const hubId = 'junc_hub_center';
        junctions.push({
            id: hubId,
            x: centerX * CELL_SIZE,
            y: centerY * CELL_SIZE,
            connectorIds: [],
            type: 'hub' // High capacity hub
        });

        // 2. Rings
        // Define radii in Grid Units
        const radii = [Math.floor(Math.min(width, height) * 0.25), Math.floor(Math.min(width, height) * 0.4)];

        radii.forEach((r, rIdx) => {
            const ringId = `conn_ring_${rIdx} `;
            const path: Point[] = [];

            // Generate circle points
            const segments = 32;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const px = centerX + Math.cos(angle) * r;
                const py = centerY + Math.sin(angle) * r;
                path.push({ x: Math.floor(px * CELL_SIZE), y: Math.floor(py * CELL_SIZE) });
            }

            connectors.push({
                id: ringId,
                fromRoomId: 'LOOP', toRoomId: 'LOOP', // Loop on itself
                kind: 'corridor',
                path: path,
                width: 2 * CELL_SIZE
            });

            // Add Sockets on the ring
            const socketCount = 4 + (rIdx * 4); // More sockets on outer rings
            for (let i = 0; i < socketCount; i++) {
                const angle = (i / socketCount) * Math.PI * 2;
                const sx = centerX + Math.cos(angle) * r;
                const sy = centerY + Math.sin(angle) * r;

                // Determine orthogonal approximation for socket direction
                let dir: 'top' | 'bottom' | 'left' | 'right' = 'top';
                // Simple 4-way split
                if (angle >= Math.PI * 1.75 || angle < Math.PI * 0.25) dir = 'right';
                else if (angle >= Math.PI * 0.25 && angle < Math.PI * 0.75) dir = 'bottom'; // Screen Y is down
                else if (angle >= Math.PI * 0.75 && angle < Math.PI * 1.25) dir = 'left';
                else dir = 'top';

                sockets.push({
                    id: `socket_ring_${rIdx}_${i} `,
                    x: Math.floor(sx), // Skeleton uses grid coords for sockets? 
                    // Wait, createRoomAtSocket uses `socket.x` directly then multiplies `x * 40`.
                    // But in generateLinearSpine, I set socket x to `leftX` (grid units).
                    // So YES, socket x/y should be GRID UNITS.
                    y: Math.floor(sy),
                    direction: dir,
                    width: 2
                });
            }
        });

        // 3. Spokes (connect Hub to Rings)
        const spokeCount = 4;
        for (let i = 0; i < spokeCount; i++) {
            const angle = (i / spokeCount) * Math.PI * 2;
            const spokeId = `conn_spoke_${i} `;
            const path: Point[] = [];

            // From Center to Outer Ring
            const maxR = radii[radii.length - 1];
            // Step along ray
            const steps = Math.floor(maxR);
            for (let s = 0; s <= steps; s++) {
                const px = centerX + Math.cos(angle) * s;
                const py = centerY + Math.sin(angle) * s;
                path.push({ x: Math.floor(px * CELL_SIZE), y: Math.floor(py * CELL_SIZE) });
            }

            connectors.push({
                id: spokeId,
                fromRoomId: (i === 0) ? 'HUB' : 'RINGS',
                toRoomId: 'OUTER',
                kind: 'corridor',
                path: path,
                width: 1 * CELL_SIZE
            });

            // Add Junctions where spoke meets rings?
            // For now, implicit intersection by geometry.
        }

        return { connectors, junctions, sockets };
    }

    /**
     * Strategy B: Grid Skeleton (Capital Ships / Bunkers)
     * Creates a regular grid of corridors with arterial cross-paths.
     */
    private generateGridSkeleton(width: number, height: number): SkeletonResult {
        const connectors: LayoutConnector[] = [];
        const junctions: Junction[] = [];
        const sockets: Socket[] = [];

        const CELL_SIZE = 40;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // Parameters
        const margin = 4;
        const spacingX = this.rng.randomInt(6, 10); // Width of city blocks
        const spacingY = this.rng.randomInt(6, 10); // Height of city blocks

        console.log(`Generating Grid Skeleton: ${width}x${height}, spacing ${spacingX}x${spacingY} `);

        const startX = margin;
        const startY = margin;
        const endX = width - margin;
        const endY = height - margin;

        const verticalLines: number[] = [];
        const horizontalLines: number[] = [];

        // 1. Generate Grid Lines
        for (let x = startX; x <= endX; x += spacingX) verticalLines.push(x);
        for (let y = startY; y <= endY; y += spacingY) horizontalLines.push(y);

        // 2. Create Corridors along lines
        // Vertical
        verticalLines.forEach((x, i) => {
            const id = `conn_v_${i} `;
            const path = [];
            // Span full height
            for (let y = startY; y <= endY; y++) {
                path.push({ x: x * CELL_SIZE, y: y * CELL_SIZE });
            }
            // Determine width: central one is wide?
            const isCentral = Math.abs(x - centerX) < spacingX;
            const w = isCentral ? 2 * CELL_SIZE : 1 * CELL_SIZE;

            connectors.push({
                id, fromRoomId: 'GRID_V', toRoomId: 'GRID_V',
                kind: 'corridor', path, width: w
            });

            // Add sockets along this corridor
            // Start from index 1 to avoid corners for now
            for (let y = startY + 2; y < endY - 2; y += 4) {
                // Check if close to horizontal intersection
                const nearIntersect = horizontalLines.some(hy => Math.abs(hy - y) < 2);
                if (!nearIntersect) {
                    sockets.push({
                        id: `socket_v_${i}_${y} _L`,
                        x, y, direction: 'left', width: 1
                    });
                    sockets.push({
                        id: `socket_v_${i}_${y} _R`,
                        x, y, direction: 'right', width: 1
                    });
                }
            }
        });

        // Horizontal
        horizontalLines.forEach((y, i) => {
            const id = `conn_h_${i} `;
            const path = [];
            for (let x = startX; x <= endX; x++) {
                path.push({ x: x * CELL_SIZE, y: y * CELL_SIZE });
            }
            const isCentral = Math.abs(y - centerY) < spacingY;
            const w = isCentral ? 2 * CELL_SIZE : 0.5 * CELL_SIZE; // Tertiary corridors narrower?

            connectors.push({
                id, fromRoomId: 'GRID_H', toRoomId: 'GRID_H',
                kind: 'corridor', path, width: w
            });

            // Sockets
            for (let x = startX + 2; x < endX - 2; x += 4) {
                const nearIntersect = verticalLines.some(vx => Math.abs(vx - x) < 2);
                if (!nearIntersect) {
                    sockets.push({
                        id: `socket_h_${i}_${x} _T`,
                        x, y, direction: 'top', width: 1
                    });
                    sockets.push({
                        id: `socket_h_${i}_${x} _B`,
                        x, y, direction: 'bottom', width: 1
                    });
                }
            }
        });

        // 3. Junctions at Intersections
        verticalLines.forEach((x, ix) => {
            horizontalLines.forEach((y, iy) => {
                junctions.push({
                    id: `junc_${ix}_${iy} `,
                    x: x * CELL_SIZE,
                    y: y * CELL_SIZE,
                    connectorIds: [], // To be filled if strict
                    type: 'cross'
                });
            });
        });

        return { connectors, junctions, sockets };
    }

    /**
     * Strategy E: Cluster (Planetary Base / Colony)
     * Scattered hubs connected by tubes.
     */
    private generateClusterSkeleton(width: number, height: number): SkeletonResult {
        const connectors: LayoutConnector[] = [];
        const junctions: Junction[] = [];
        const sockets: Socket[] = [];
        const CELL_SIZE = 40;
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        // 1. Generate Hub Points (Nodes)
        const hubs: Point[] = [{ x: centerX, y: centerY }];
        const hubCount = this.rng.randomInt(4, 7); // Increased hub count

        for (let i = 0; i < hubCount; i++) {
            const angle = this.rng.randomFloat(0, Math.PI * 2);
            // Distribute hubs in a cloud
            const dist = this.rng.randomFloat(width * 0.15, width * 0.4);
            const hx = Math.floor(centerX + Math.cos(angle) * dist);
            const hy = Math.floor(centerY + Math.sin(angle) * dist);
            // Ensure bounds
            if (hx > 2 && hx < width - 2 && hy > 2 && hy < height - 2) {
                hubs.push({ x: hx, y: hy });
            }
        }

        // 2. Connect Hubs (Partial Mesh)
        // Ensure connectivity: Connect every node to at least one nearest neighbor
        // Then add random links based on proximity
        const connected = new Set<number>();
        connected.add(0);

        const links: [number, number][] = [];

        // Simple MST-like approach: grow the connected set
        while (connected.size < hubs.length) {
            let minDist = Infinity;
            let bestLink = [-1, -1];

            for (const i of connected) {
                for (let j = 0; j < hubs.length; j++) {
                    if (connected.has(j)) continue;

                    const dx = hubs[i].x - hubs[j].x;
                    const dy = hubs[i].y - hubs[j].y;
                    const d = Math.abs(dx) + Math.abs(dy); // Manhattan
                    if (d < minDist) {
                        minDist = d;
                        bestLink = [i, j];
                    }
                }
            }
            if (bestLink[0] !== -1) {
                links.push(bestLink as [number, number]);
                connected.add(bestLink[1]);
            }
        }

        // Add loops (1-2 extra random proximity links)
        for (let i = 0; i < hubs.length; i++) {
            for (let j = i + 1; j < hubs.length; j++) {
                // If not already linked
                if (links.some(l => (l[0] === i && l[1] === j) || (l[0] === j && l[1] === i))) continue;

                const dx = hubs[i].x - hubs[j].x;
                const dy = hubs[i].y - hubs[j].y;
                const d = Math.abs(dx) + Math.abs(dy);

                // if close enough, chance to link
                if (d < width * 0.3 && this.rng.chance(0.3)) {
                    links.push([i, j]);
                }
            }
        }

        // 3. Render Links
        links.forEach((link, idx) => {
            const start = hubs[link[0]];
            const end = hubs[link[1]];
            const tubeId = `conn_tube_${idx}`;

            // L-Shape Path
            const path: Point[] = [];
            // Randomize corner order
            if (this.rng.chance(0.5)) {
                // X then Y
                const xDir = end.x > start.x ? 1 : -1;
                for (let x = start.x; x !== end.x; x += xDir) path.push({ x: x * CELL_SIZE, y: start.y * CELL_SIZE });
                path.push({ x: end.x * CELL_SIZE, y: start.y * CELL_SIZE }); // Corner
                const yDir = end.y > start.y ? 1 : -1;
                for (let y = start.y; y !== end.y; y += yDir) path.push({ x: end.x * CELL_SIZE, y: y * CELL_SIZE });
            } else {
                // Y then X
                const yDir = end.y > start.y ? 1 : -1;
                for (let y = start.y; y !== end.y; y += yDir) path.push({ x: start.x * CELL_SIZE, y: y * CELL_SIZE });
                path.push({ x: start.x * CELL_SIZE, y: end.y * CELL_SIZE }); // Corner
                const xDir = end.x > start.x ? 1 : -1;
                for (let x = start.x; x !== end.x; x += xDir) path.push({ x: x * CELL_SIZE, y: end.y * CELL_SIZE });
            }
            path.push({ x: end.x * CELL_SIZE, y: end.y * CELL_SIZE });

            connectors.push({
                id: tubeId,
                fromRoomId: `HUB_${link[0]}`, toRoomId: `HUB_${link[1]}`,
                kind: 'corridor',
                path: path,
                width: 1 * CELL_SIZE
            });

            // Sockets along tube
            for (let p = 2; p < path.length - 2; p += 4) {
                const pt = path[p];
                const gx = Math.floor(pt.x / CELL_SIZE);
                const gy = Math.floor(pt.y / CELL_SIZE);
                sockets.push({
                    id: `socket_tube_${idx}_${p}`,
                    x: gx, y: gy,
                    direction: this.rng.pick(['top', 'bottom', 'left', 'right']),
                    width: 1
                });
            }
        });

        // Junctions at Hubs
        hubs.forEach((h, i) => {
            junctions.push({
                id: `junc_hub_${i}`,
                x: h.x * CELL_SIZE, y: h.y * CELL_SIZE,
                connectorIds: [], // ToDo: Link technically
                type: 'hub'
            });
            // Also add sockets at hubs for primary modules
            sockets.push({
                id: `socket_hub_${i}_main`,
                x: h.x, y: h.y,
                direction: 'top', width: 2
            });
        });

        return { connectors, junctions, sockets };
    }

    /**
     * Main entry point to generate a skeleton based on strategy
     */
    generate(request: GenerationRequest, gridWidth: number, gridHeight: number): SkeletonResult {
        if (request.archetype === 'station') {
            return this.generateRingSkeleton(gridWidth, gridHeight);
        }
        if (request.archetype === 'outpost') {
            return this.generateClusterSkeleton(gridWidth, gridHeight);
        }
        if (request.archetype === 'capital' || request.archetype === 'bunker' || (request.archetype === 'ship' && request.sizeTier === 'lg')) {
            // Large ships, capital ships, and bunkers use a grid layout
            return this.generateGridSkeleton(gridWidth, gridHeight);
        }
        // Default to Linear Spine
        return this.generateLinearSpine(gridWidth, gridHeight, request);
    }

    /**
     * Strategy A: Linear Spine (NASApunk / Explorer)
     * Creates a central spine with branching ribs.
     */
    /**
     * Strategy A: Linear Spine (NASApunk / Explorer)
     * Creates a central spine with branching ribs. 
     * Enhanced to include secondary structures (nacelles, asymmetric ribs).
     */
    private generateLinearSpine(width: number, height: number, request?: GenerationRequest): SkeletonResult {
        const connectors: LayoutConnector[] = [];
        const junctions: Junction[] = [];
        const sockets: Socket[] = [];

        // Parameters based on Subtype
        const subtype = request?.subtype || 'generic';
        const loopiness = request?.loopiness || 0.3;

        // Military: Strict symmetry, ordered
        // Freighter: Bulky, potential asymmetry
        // Explorer: Long, spindly, high nacelle chance
        const isMilitary = subtype === 'military' || subtype === 'carrier';
        const isFreighter = subtype === 'freighter' || subtype === 'cargo' || subtype === 'miner';

        const centerX = Math.floor(width / 2);

        // Spine Length
        let spineLenRatio = this.rng.randomFloat(0.6, 0.85);
        if (isFreighter) spineLenRatio = this.rng.randomFloat(0.5, 0.7); // Stubby

        const spineHeight = Math.floor(height * spineLenRatio);
        const spineStartY = Math.floor((height - spineHeight) / 2);
        const spineEndY = spineStartY + spineHeight;

        const CELL_SIZE = 40;

        // 1. Create the Main Spine
        const spineId = 'conn_spine_main';
        const spinePath: Point[] = [];
        for (let y = spineStartY; y <= spineEndY; y++) {
            spinePath.push({ x: centerX * CELL_SIZE, y: y * CELL_SIZE });
        }

        connectors.push({
            id: spineId,
            fromRoomId: 'START',
            toRoomId: 'END',
            kind: 'corridor',
            path: spinePath,
            width: 3 * CELL_SIZE
        });

        // 2. Generate Ribs
        // Variation: Asymmetrical or Paired?
        let symmetryChance = 0.7;
        if (isMilitary) symmetryChance = 0.95;
        if (isFreighter) symmetryChance = 0.5;

        const symmetry = this.rng.chance(symmetryChance);

        const minRibs = isFreighter ? 3 : 4;
        const maxRibs = isMilitary ? 7 : 6;
        const ribCount = this.rng.randomInt(minRibs, maxRibs);
        const ribInterval = Math.floor((spineEndY - spineStartY) / (ribCount + 1));

        const leftRibTips: Point[] = [];
        const rightRibTips: Point[] = [];

        for (let i = 1; i <= ribCount; i++) {
            const y = spineStartY + (i * ribInterval);

            // Shape Factor: Tapered hull (wider in middle/back, narrow at front)
            const normY = (y - spineStartY) / spineHeight;
            // Width factor: simple curve
            // Freighter: Boxier (less taper)
            const widthFactor = isFreighter ?
                (0.8 + 0.2 * Math.sin(normY * Math.PI)) :
                (0.5 + 0.5 * Math.sin(normY * Math.PI));

            const ribLen = Math.floor(width * 0.4 * widthFactor);

            const leftX = centerX - Math.floor(ribLen / 2);
            const rightX = centerX + Math.floor(ribLen / 2);

            // Determine which ribs exist
            const hasLeft = symmetry || this.rng.chance(0.6);
            const hasRight = symmetry || (hasLeft ? this.rng.chance(0.6) : true);

            if (hasLeft) {
                const ribLeftId = `conn_rib_${i}_left`;
                const leftPath: Point[] = [];
                for (let x = leftX; x <= centerX; x++) {
                    leftPath.push({ x: x * CELL_SIZE, y: y * CELL_SIZE });
                }
                connectors.push({
                    id: ribLeftId,
                    fromRoomId: 'SPINE',
                    toRoomId: 'SOCKET_L',
                    kind: 'corridor',
                    path: leftPath,
                    width: 1 * CELL_SIZE
                });
                sockets.push({
                    id: `socket_rib_${i}_left`,
                    x: leftX,
                    y: y,
                    direction: 'left',
                    width: 1
                });
                leftRibTips.push({ x: leftX, y: y });
            }

            if (hasRight) {
                const ribRightId = `conn_rib_${i}_right`;
                const rightPath: Point[] = [];
                for (let x = centerX; x <= rightX; x++) {
                    rightPath.push({ x: x * CELL_SIZE, y: y * CELL_SIZE });
                }
                connectors.push({
                    id: ribRightId,
                    fromRoomId: 'SPINE',
                    toRoomId: 'SOCKET_R',
                    kind: 'corridor',
                    path: rightPath,
                    width: 1 * CELL_SIZE
                });
                sockets.push({
                    id: `socket_rib_${i}_right`,
                    x: rightX,
                    y: y,
                    direction: 'right',
                    width: 1
                });
                rightRibTips.push({ x: rightX, y: y });
            }

            if (hasLeft || hasRight) {
                junctions.push({
                    id: `junc_rib_${i} `,
                    x: centerX * CELL_SIZE,
                    y: y * CELL_SIZE,
                    connectorIds: [spineId],
                    type: 'cross'
                });
            }
        }

        // Loopiness: Connect Rib Tips (Cross-Connections)
        if (loopiness > 0.4) {
            // Connect Left Tips
            for (let i = 0; i < leftRibTips.length - 1; i++) {
                if (this.rng.chance(loopiness)) {
                    const p1 = leftRibTips[i];
                    const p2 = leftRibTips[i + 1];
                    const pathPts: Point[] = [];
                    // Down
                    for (let cy = p1.y; cy <= p2.y; cy++) pathPts.push({ x: p1.x * CELL_SIZE, y: cy * CELL_SIZE });
                    // Across
                    if (p1.x !== p2.x) {
                        const step = p2.x > p1.x ? 1 : -1;
                        for (let cx = p1.x; cx !== p2.x; cx += step) pathPts.push({ x: cx * CELL_SIZE, y: p2.y * CELL_SIZE });
                    }

                    connectors.push({
                        id: `conn_loop_L_${i}`,
                        fromRoomId: 'RIB_L', toRoomId: 'RIB_L',
                        kind: 'corridor',
                        path: pathPts,
                        width: 1 * CELL_SIZE
                    });
                }
            }
            // Connect Right Tips
            for (let i = 0; i < rightRibTips.length - 1; i++) {
                if (this.rng.chance(loopiness)) {
                    const p1 = rightRibTips[i];
                    const p2 = rightRibTips[i + 1];
                    const pathPts: Point[] = [];
                    // Down
                    for (let cy = p1.y; cy <= p2.y; cy++) pathPts.push({ x: p1.x * CELL_SIZE, y: cy * CELL_SIZE });
                    // Across
                    if (p1.x !== p2.x) {
                        const step = p2.x > p1.x ? 1 : -1;
                        for (let cx = p1.x; cx !== p2.x; cx += step) pathPts.push({ x: cx * CELL_SIZE, y: p2.y * CELL_SIZE });
                    }

                    connectors.push({
                        id: `conn_loop_R_${i}`,
                        fromRoomId: 'RIB_R', toRoomId: 'RIB_R',
                        kind: 'corridor',
                        path: pathPts,
                        width: 1 * CELL_SIZE
                    });
                }
            }
        }

        // 3. Engine Pods / Nacelles (Optional secondary spines)
        let nacelleChance = 0.5;
        if (isMilitary) nacelleChance = 0.2; // Integrated engines
        if (isFreighter) nacelleChance = 0.8; // External pods

        if (this.rng.chance(nacelleChance)) {
            const nacelleOffset = Math.floor(width * 0.3);
            const nacelleLength = Math.floor(spineHeight * 0.4);
            const nacelleY = spineEndY - Math.floor(nacelleLength * 0.8);

            // Left Nacelle
            const nLeftX = centerX - nacelleOffset;
            const nacellePath: Point[] = [];
            for (let y = nacelleY; y <= nacelleY + nacelleLength; y++) {
                nacellePath.push({ x: nLeftX * CELL_SIZE, y: y * CELL_SIZE });
            }
            connectors.push({ id: 'nacelle_L', fromRoomId: 'RIB', toRoomId: 'ENGINE', kind: 'corridor', path: nacellePath, width: 2 * CELL_SIZE });
            // Connect to spine via a strut (rib)
            const strutY = nacelleY + Math.floor(nacelleLength * 0.2);
            const strutPath: Point[] = [];
            for (let x = nLeftX; x <= centerX; x++) strutPath.push({ x: x * CELL_SIZE, y: strutY * CELL_SIZE });
            connectors.push({ id: 'strut_L', fromRoomId: 'SPINE', toRoomId: 'NACELLE', kind: 'corridor', path: strutPath, width: 1 * CELL_SIZE });

            sockets.push({ id: 'socket_nacelle_L_bottom', x: nLeftX, y: nacelleY + nacelleLength, direction: 'bottom', width: 2 });

            // Right Nacelle (Mirrored)
            const nRightX = centerX + nacelleOffset;
            const nacellePathR: Point[] = [];
            for (let y = nacelleY; y <= nacelleY + nacelleLength; y++) {
                nacellePathR.push({ x: nRightX * CELL_SIZE, y: y * CELL_SIZE });
            }
            connectors.push({ id: 'nacelle_R', fromRoomId: 'RIB', toRoomId: 'ENGINE', kind: 'corridor', path: nacellePathR, width: 2 * CELL_SIZE });
            const strutPathR: Point[] = [];
            for (let x = centerX; x <= nRightX; x++) strutPathR.push({ x: x * CELL_SIZE, y: strutY * CELL_SIZE });
            connectors.push({ id: 'strut_R', fromRoomId: 'SPINE', toRoomId: 'NACELLE', kind: 'corridor', path: strutPathR, width: 1 * CELL_SIZE });

            sockets.push({ id: 'socket_nacelle_R_bottom', x: nRightX, y: nacelleY + nacelleLength, direction: 'bottom', width: 2 });
        }

        // Add Sockets at top and bottom of spine (Bridge / Engine)
        sockets.push({
            id: 'socket_spine_top',
            x: centerX,
            y: spineStartY,
            direction: 'top',
            width: 3
        });
        sockets.push({
            id: 'socket_spine_bottom',
            x: centerX,
            y: spineEndY,
            direction: 'bottom',
            width: 3
        });

        return { connectors, junctions, sockets };
    }

    /**
     * Attach rooms to the generated skeleton sockets
     */
    /**
     * Attach rooms to the generated skeleton sockets
     */
    public attachRooms(skeleton: SkeletonResult, program: any): LayoutRoom[] {
        const rooms: LayoutRoom[] = [];
        const usedSockets = new Set<string>();

        console.log(`Attaching rooms: ${program.rooms.length} rooms to place, ${skeleton.sockets.length} sockets available.`);

        // Helper to find connector attached to socket
        // Updated to use geometry for robustness (Grid Skeleton sockets aren't linked by ID)
        const findConnectorForSocket = (socket: Socket) => {
            // First check by ID (Legacy/Spine support)
            const byId = skeleton.connectors.find(c => c.toRoomId === socket.id || c.fromRoomId === socket.id);
            if (byId) return byId;

            // Geometry check
            const sx = socket.x * 40;
            const sy = socket.y * 40;
            return skeleton.connectors.find(c => c.path.some(p => Math.abs(p.x - sx) < 2 && Math.abs(p.y - sy) < 2));
        };

        // 1. Assign Primary Rooms to Spine Sockets
        const primaryRooms = program.rooms.filter((r: any) => r.importance === 'primary');
        const spineSockets = skeleton.sockets.filter(s => s.direction === 'top' || s.direction === 'bottom');

        for (const socket of spineSockets) {
            let roomToPlace: any;
            if (socket.direction === 'top') {
                roomToPlace = primaryRooms.find((r: any) => r.roomType === 'bridge' || r.roomType === 'cockpit');
            } else if (socket.direction === 'bottom') {
                roomToPlace = primaryRooms.find((r: any) => r.roomType === 'engineering' || r.roomType === 'reactor');
            }

            if (roomToPlace) {
                const conn = findConnectorForSocket(socket);
                const room = this.createRoomAtSocket(roomToPlace, socket, conn?.id);

                if (this.checkCollision(room, rooms)) {
                    // Try to nudge? For now, skip if collision (which shouldn't happen on spine tips usually)
                    console.warn(`Collision placing primary room ${room.id} at ${socket.id} `);
                } else {
                    rooms.push(room);
                    usedSockets.add(socket.id);

                    // Update connector endpoints (Only if originally was the socket placeholder)
                    if (conn) {
                        if (conn.toRoomId === socket.id) conn.toRoomId = room.id;
                        if (conn.fromRoomId === socket.id) conn.fromRoomId = room.id;
                    }

                    const idx = primaryRooms.indexOf(roomToPlace);
                    if (idx > -1) primaryRooms.splice(idx, 1);
                }
            }
        }

        // 2. Assign remaining rooms to Rib Sockets
        let availableRooms = [...program.rooms].filter(r => !rooms.find(placed => placed.id === r.id));
        const ribSockets = skeleton.sockets.filter(s => !usedSockets.has(s.id));

        // Shuffle sockets
        const shuffledSockets = this.rng.shuffle(ribSockets);

        for (const socket of shuffledSockets) {
            if (availableRooms.length === 0) break;

            // Try to find a room that fits
            // Simple First-Fit logic for now
            const roomCandidate = availableRooms[0];
            const conn = findConnectorForSocket(socket);
            const room = this.createRoomAtSocket(roomCandidate, socket, conn?.id);

            if (!this.checkCollision(room, rooms)) {
                rooms.push(room);
                usedSockets.add(socket.id);
                availableRooms.shift(); // Remove placed room

                // Update connector endpoints (Only if originally was the socket placeholder)
                if (conn) {
                    if (conn.toRoomId === socket.id) conn.toRoomId = room.id;
                    if (conn.fromRoomId === socket.id) conn.fromRoomId = room.id;
                }
            }
        }

        return rooms;
    }

    private checkCollision(room: LayoutRoom, existingRooms: LayoutRoom[]): boolean {
        // Simple AABB collision
        // Allow 1 cell padding?
        const padding = 0;

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

    private createRoomAtSocket(programRoom: any, socket: Socket, connectorId?: string): LayoutRoom {
        // Align room center/edge to socket
        // For now, place center of room adjacent to socket direction
        const w = programRoom.estimatedWidth || 4;
        const h = programRoom.estimatedHeight || 4;

        let x = socket.x;
        let y = socket.y;
        let portWall: 'top' | 'bottom' | 'left' | 'right' = 'top';

        // Adjust based on direction (socket is the connection point on the corridor)
        if (socket.direction === 'top') {
            // Room is above
            y = socket.y - h;
            portWall = 'bottom';
        } else if (socket.direction === 'bottom') {
            // Room is below
            y = socket.y + 1; // +1 to be adjacent?
            // Actually, if socket is at Y, and corridor is at Y.
            // If we want room valid, it shouldn't overlap corridor.
            // Wait, skeleton corridors are lines? Or have width?
            // Connector width is typically 1 (40px) in grid?
            // Usually path is center.
            // If socket is AT path center, room must be offset by half corridor width?
            // Current socket generation puts socket ON the centerline.
            // room should start +/- 1?
            // If I put y=socket.y+1, it means room starts 1 cell below socket center.
            portWall = 'top';
        } else if (socket.direction === 'left') {
            x = socket.x - w;
            portWall = 'right';
        } else if (socket.direction === 'right') {
            x = socket.x + 1;
            portWall = 'left';
        }

        // Correction for alignment (centering on socket axis)
        if (socket.direction === 'top' || socket.direction === 'bottom') {
            // Center X
            x = socket.x - Math.floor(w / 2);
        } else {
            // Center Y
            y = socket.y - Math.floor(h / 2);
        }

        const ports: Port[] = [];
        if (connectorId) {
            ports.push({
                id: `port - ${programRoom.id} -${connectorId} `,
                x: socket.x * 40,
                y: socket.y * 40,
                wall: portWall,
                connectorId
            });
        }

        return {
            id: programRoom.id,
            roomType: programRoom.roomType,
            label: programRoom.label,
            x: x * 40,
            y: y * 40,
            width: w * 40,
            height: h * 40,
            gridX: Math.round(x),
            gridY: Math.round(y),
            gridWidth: w,
            gridHeight: h,
            zone: programRoom.zone,
            ports,
            isExterior: false
        };
    }
}
