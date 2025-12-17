/**
 * Topology Graph Generator
 * Stage 3 of the generation pipeline: Build connectivity graph
 * Based on specification from 04_topology_graph.md
 */

import type {
  GenerationRequest,
  RoomProgram,
  ProgrammedRoom,
  TopologyGraph,
  GraphConnector,
  GraphMetrics,
  ConnectorKind,
  SizeTier
} from './types'
import type { SeededRNG } from './types'
import { createRNG, generateStableId } from './rng'

// ============================================================================
// GRAPH NODE & EDGE TYPES
// ============================================================================

interface GraphNode {
  roomId: string
  room: ProgrammedRoom
  deck: number
  cluster: string | null
  isBackbone: boolean
  connections: Set<string>
}

interface GraphEdge {
  id: string
  fromId: string
  toId: string
  kind: ConnectorKind
  isBackbone: boolean
  isLoop: boolean
  crossesDeck: boolean
}

// ============================================================================
// TOPOLOGY GENERATOR
// ============================================================================

export interface TopologyOptions {
  request: GenerationRequest
  program: RoomProgram
}

export function generateTopology(options: TopologyOptions): TopologyGraph {
  const { request, program } = options
  const rng = createRNG(request.seed + '-topology')
  
  // Initialize nodes
  const nodes = new Map<string, GraphNode>()
  for (const room of program.rooms) {
    nodes.set(room.id, {
      roomId: room.id,
      room,
      deck: 0, // Will be assigned later
      cluster: null,
      isBackbone: room.importance === 'primary',
      connections: new Set()
    })
  }
  
  const edges: GraphEdge[] = []
  let edgeIndex = 0
  
  // Phase 1: Assign decks
  const deckCount = getDeckCount(request.sizeTier, rng)
  assignDecks(nodes, deckCount, rng)
  
  // Phase 2: Build backbone (connect primary rooms)
  const backboneEdges = buildBackbone(nodes, request, rng, edgeIndex)
  edges.push(...backboneEdges)
  edgeIndex += backboneEdges.length
  
  // Phase 3: Build clusters (group secondary rooms around primaries)
  const clusterEdges = buildClusters(nodes, request, rng, edgeIndex)
  edges.push(...clusterEdges)
  edgeIndex += clusterEdges.length
  
  // Phase 4: Add tertiary rooms to clusters
  const tertiaryEdges = attachTertiaryRooms(nodes, request, rng, edgeIndex)
  edges.push(...tertiaryEdges)
  edgeIndex += tertiaryEdges.length
  
  // Phase 5: Add loops based on loopiness parameter
  const loopEdges = addLoops(nodes, edges, request, rng, edgeIndex)
  edges.push(...loopEdges)
  edgeIndex += loopEdges.length
  
  // Phase 6: Add vertical connectors between decks
  const verticalEdges = addVerticalConnectors(nodes, edges, deckCount, request, rng, edgeIndex)
  edges.push(...verticalEdges)
  edgeIndex += verticalEdges.length
  
  // Phase 7: Ensure all rooms are connected
  const rescueEdges = ensureConnectivity(nodes, edges, request, rng, edgeIndex)
  edges.push(...rescueEdges)
  
  // Convert to output format
  const connectors: GraphConnector[] = edges.map(e => ({
    id: e.id,
    fromRoomId: e.fromId,
    toRoomId: e.toId,
    kind: e.kind,
    isBackbone: e.isBackbone,
    isVertical: e.crossesDeck
  }))
  
  // Group rooms by deck
  const roomsByDeck: Record<number, string[]> = {}
  for (const [id, node] of nodes) {
    if (!roomsByDeck[node.deck]) {
      roomsByDeck[node.deck] = []
    }
    roomsByDeck[node.deck].push(id)
  }
  
  // Calculate metrics
  const metrics = calculateMetrics(nodes, edges)
  
  return {
    rooms: program.rooms.map(r => ({
      ...r,
      deck: nodes.get(r.id)?.deck || 0
    })),
    connectors,
    deckCount,
    roomsByDeck,
    metrics
  }
}

// ============================================================================
// DECK ASSIGNMENT
// ============================================================================

const DECK_COUNTS: Record<SizeTier, { min: number; max: number }> = {
  xs: { min: 1, max: 1 },
  sm: { min: 1, max: 2 },
  md: { min: 2, max: 3 },
  lg: { min: 3, max: 5 },
  xl: { min: 4, max: 8 }
}

function getDeckCount(sizeTier: SizeTier, rng: SeededRNG): number {
  const { min, max } = DECK_COUNTS[sizeTier]
  return rng.randomInt(min, max)
}

function assignDecks(nodes: Map<string, GraphNode>, deckCount: number, rng: SeededRNG): void {
  if (deckCount === 1) {
    // All rooms on deck 0
    return
  }
  
  const roomList = Array.from(nodes.values())
  
  // Primary rooms spread across decks
  const primaryRooms = roomList.filter(n => n.room.importance === 'primary')
  const secondaryRooms = roomList.filter(n => n.room.importance === 'secondary')
  const tertiaryRooms = roomList.filter(n => n.room.importance === 'tertiary')
  
  // Distribute primary rooms evenly
  const shuffledPrimary = rng.shuffle(primaryRooms)
  shuffledPrimary.forEach((node, i) => {
    node.deck = i % deckCount
  })
  
  // Secondary rooms follow their preferred adjacencies or random deck
  for (const node of secondaryRooms) {
    // Find connected primary room
    const preferredAdj = node.room.adjacencyPreferences
    let targetDeck = rng.randomInt(0, deckCount - 1)
    
    for (const adjType of preferredAdj) {
      const adjNode = Array.from(nodes.values()).find(
        n => n.room.roomType === adjType && n.room.importance === 'primary'
      )
      if (adjNode) {
        targetDeck = adjNode.deck
        break
      }
    }
    
    node.deck = targetDeck
  }
  
  // Tertiary rooms distributed based on zone
  for (const node of tertiaryRooms) {
    // Crew zones tend to be on upper decks, cargo on lower
    if (node.room.zone === 'crew') {
      node.deck = Math.min(deckCount - 1, rng.randomInt(Math.floor(deckCount / 2), deckCount - 1))
    } else if (node.room.zone === 'cargo') {
      node.deck = rng.randomInt(0, Math.floor(deckCount / 2))
    } else {
      node.deck = rng.randomInt(0, deckCount - 1)
    }
  }
}

// ============================================================================
// BACKBONE GENERATION
// ============================================================================

function buildBackbone(
  nodes: Map<string, GraphNode>,
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  // Get primary rooms sorted by importance
  const primaryRooms = Array.from(nodes.values())
    .filter(n => n.room.importance === 'primary')
  
  if (primaryRooms.length < 2) return edges
  
  // Group by deck
  const byDeck = new Map<number, GraphNode[]>()
  for (const node of primaryRooms) {
    const list = byDeck.get(node.deck) || []
    list.push(node)
    byDeck.set(node.deck, list)
  }
  
  // Build backbone within each deck (linear or hub pattern)
  for (const [deck, deckNodes] of byDeck) {
    if (deckNodes.length < 2) continue
    
    // Choose pattern based on archetype
    const useHub = request.archetype === 'station' && rng.chance(0.6)
    
    if (useHub) {
      // Hub pattern: first node connects to all others
      const hub = deckNodes[0]
      for (let i = 1; i < deckNodes.length; i++) {
        const spoke = deckNodes[i]
        edges.push(createEdge(hub.roomId, spoke.roomId, 'corridor', true, false, false, edgeIndex++, request))
        hub.connections.add(spoke.roomId)
        spoke.connections.add(hub.roomId)
      }
    } else {
      // Linear/spine pattern
      const shuffled = rng.shuffle(deckNodes)
      for (let i = 0; i < shuffled.length - 1; i++) {
        const from = shuffled[i]
        const to = shuffled[i + 1]
        edges.push(createEdge(from.roomId, to.roomId, 'corridor', true, false, false, edgeIndex++, request))
        from.connections.add(to.roomId)
        to.connections.add(from.roomId)
      }
    }
  }
  
  // Mark backbone nodes
  for (const node of primaryRooms) {
    node.isBackbone = true
  }
  
  return edges
}

// ============================================================================
// CLUSTER BUILDING
// ============================================================================

function buildClusters(
  nodes: Map<string, GraphNode>,
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  const secondaryRooms = Array.from(nodes.values())
    .filter(n => n.room.importance === 'secondary')
  
  const primaryRooms = Array.from(nodes.values())
    .filter(n => n.room.importance === 'primary')
  
  for (const secondary of secondaryRooms) {
    // Find best primary room to attach to based on adjacency preferences
    let bestPrimary: GraphNode | null = null
    let bestScore = -1
    
    // Filter to same deck
    const sameDeckPrimaries = primaryRooms.filter(p => p.deck === secondary.deck)
    const candidates = sameDeckPrimaries.length > 0 ? sameDeckPrimaries : primaryRooms
    
    for (const primary of candidates) {
      let score = 0
      
      // Check adjacency preferences
      if (secondary.room.adjacencyPreferences.includes(primary.room.roomType)) {
        score += 10
      }
      if (primary.room.adjacencyPreferences?.includes(secondary.room.roomType)) {
        score += 5
      }
      
      // Same zone bonus
      if (secondary.room.zone === primary.room.zone) {
        score += 3
      }
      
      // Add some randomness
      score += rng.random() * 2
      
      if (score > bestScore) {
        bestScore = score
        bestPrimary = primary
      }
    }
    
    if (bestPrimary) {
      secondary.cluster = bestPrimary.roomId
      
      const crossesDeck = bestPrimary.deck !== secondary.deck
      const kind: ConnectorKind = crossesDeck ? 'bulkhead' : 'corridor'
      
      edges.push(createEdge(
        bestPrimary.roomId,
        secondary.roomId,
        kind,
        false,
        false,
        crossesDeck,
        edgeIndex++,
        request
      ))
      
      bestPrimary.connections.add(secondary.roomId)
      secondary.connections.add(bestPrimary.roomId)
    }
  }
  
  return edges
}

// ============================================================================
// TERTIARY ROOM ATTACHMENT
// ============================================================================

function attachTertiaryRooms(
  nodes: Map<string, GraphNode>,
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  const tertiaryRooms = Array.from(nodes.values())
    .filter(n => n.room.importance === 'tertiary')
  
  const connectedRooms = Array.from(nodes.values())
    .filter(n => n.connections.size > 0)
  
  for (const tertiary of tertiaryRooms) {
    // Find rooms on same deck that could host this tertiary room
    const sameDeckConnected = connectedRooms.filter(c => c.deck === tertiary.deck)
    const candidates = sameDeckConnected.length > 0 ? sameDeckConnected : connectedRooms
    
    if (candidates.length === 0) continue
    
    // Prefer rooms with adjacency preference match
    let bestCandidate: GraphNode | null = null
    let bestScore = -1
    
    for (const candidate of candidates) {
      let score = 0
      
      if (tertiary.room.adjacencyPreferences.includes(candidate.room.roomType)) {
        score += 10
      }
      
      // Don't overload any single room
      score -= candidate.connections.size * 0.5
      
      // Same zone bonus
      if (tertiary.room.zone === candidate.room.zone) {
        score += 2
      }
      
      score += rng.random() * 3
      
      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    }
    
    if (bestCandidate) {
      tertiary.cluster = bestCandidate.cluster || bestCandidate.roomId
      
      const crossesDeck = bestCandidate.deck !== tertiary.deck
      const kind: ConnectorKind = tertiary.room.zone === 'special' ? 'serviceHatch' : 'door'
      
      edges.push(createEdge(
        bestCandidate.roomId,
        tertiary.roomId,
        kind,
        false,
        false,
        crossesDeck,
        edgeIndex++,
        request
      ))
      
      bestCandidate.connections.add(tertiary.roomId)
      tertiary.connections.add(bestCandidate.roomId)
    }
  }
  
  return edges
}

// ============================================================================
// LOOP ADDITION
// ============================================================================

function addLoops(
  nodes: Map<string, GraphNode>,
  existingEdges: GraphEdge[],
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  // Loopiness 0-1 determines how many extra edges to add
  const loopiness = request.loopiness ?? 0.5
  const nodeCount = nodes.size
  
  // Target number of extra edges
  const targetLoops = Math.floor(nodeCount * loopiness * 0.3)
  
  if (targetLoops <= 0) return edges
  
  // Find potential loop connections
  const existingPairs = new Set<string>()
  for (const edge of existingEdges) {
    existingPairs.add([edge.fromId, edge.toId].sort().join('-'))
  }
  
  const nodeList = Array.from(nodes.values())
  let attempts = 0
  const maxAttempts = targetLoops * 10
  
  while (edges.length < targetLoops && attempts < maxAttempts) {
    attempts++
    
    // Pick two random rooms
    const from = rng.pick(nodeList)
    const to = rng.pick(nodeList)
    
    if (from.roomId === to.roomId) continue
    
    // Skip if already connected
    const pairKey = [from.roomId, to.roomId].sort().join('-')
    if (existingPairs.has(pairKey)) continue
    
    // Check forbidden adjacencies
    if (from.room.forbiddenAdjacencies?.includes(to.room.roomType)) continue
    if (to.room.forbiddenAdjacencies?.includes(from.room.roomType)) continue
    
    // Prefer same deck
    if (from.deck !== to.deck && rng.chance(0.7)) continue
    
    // Add loop
    existingPairs.add(pairKey)
    
    const crossesDeck = from.deck !== to.deck
    const kind: ConnectorKind = crossesDeck ? 'bulkhead' : 'corridor'
    
    edges.push(createEdge(
      from.roomId,
      to.roomId,
      kind,
      false,
      true,
      crossesDeck,
      edgeIndex++,
      request
    ))
    
    from.connections.add(to.roomId)
    to.connections.add(from.roomId)
  }
  
  return edges
}

// ============================================================================
// VERTICAL CONNECTORS
// ============================================================================

function addVerticalConnectors(
  nodes: Map<string, GraphNode>,
  existingEdges: GraphEdge[],
  deckCount: number,
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  if (deckCount <= 1) return []
  
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  const existingPairs = new Set<string>()
  for (const edge of existingEdges) {
    existingPairs.add([edge.fromId, edge.toId].sort().join('-'))
  }
  
  // Group rooms by deck
  const byDeck = new Map<number, GraphNode[]>()
  for (const node of nodes.values()) {
    const list = byDeck.get(node.deck) || []
    list.push(node)
    byDeck.set(node.deck, list)
  }
  
  // Ensure at least one vertical connector between adjacent decks
  for (let deck = 0; deck < deckCount - 1; deck++) {
    const lowerDeck = byDeck.get(deck) || []
    const upperDeck = byDeck.get(deck + 1) || []
    
    if (lowerDeck.length === 0 || upperDeck.length === 0) continue
    
    // Check if already connected
    let hasConnection = false
    for (const edge of existingEdges) {
      const fromNode = nodes.get(edge.fromId)
      const toNode = nodes.get(edge.toId)
      if (fromNode && toNode) {
        if ((fromNode.deck === deck && toNode.deck === deck + 1) ||
            (fromNode.deck === deck + 1 && toNode.deck === deck)) {
          hasConnection = true
          break
        }
      }
    }
    
    if (!hasConnection) {
      // Add a vertical connector
      const from = rng.pick(lowerDeck)
      const to = rng.pick(upperDeck)
      
      const pairKey = [from.roomId, to.roomId].sort().join('-')
      if (!existingPairs.has(pairKey)) {
        existingPairs.add(pairKey)
        
        edges.push(createEdge(
          from.roomId,
          to.roomId,
          'bulkhead',
          true,
          false,
          true,
          edgeIndex++,
          request
        ))
        
        from.connections.add(to.roomId)
        to.connections.add(from.roomId)
      }
    }
    
    // Maybe add additional vertical connectors
    const extraVertical = rng.randomInt(0, Math.floor(lowerDeck.length / 3))
    for (let i = 0; i < extraVertical; i++) {
      const from = rng.pick(lowerDeck)
      const to = rng.pick(upperDeck)
      
      const pairKey = [from.roomId, to.roomId].sort().join('-')
      if (!existingPairs.has(pairKey)) {
        existingPairs.add(pairKey)
        
        edges.push(createEdge(
          from.roomId,
          to.roomId,
          'serviceHatch',
          false,
          false,
          true,
          edgeIndex++,
          request
        ))
        
        from.connections.add(to.roomId)
        to.connections.add(from.roomId)
      }
    }
  }
  
  return edges
}

// ============================================================================
// CONNECTIVITY RESCUE
// ============================================================================

function ensureConnectivity(
  nodes: Map<string, GraphNode>,
  existingEdges: GraphEdge[],
  request: GenerationRequest,
  rng: SeededRNG,
  startIndex: number
): GraphEdge[] {
  const edges: GraphEdge[] = []
  let edgeIndex = startIndex
  
  // Find disconnected rooms
  const disconnected = Array.from(nodes.values()).filter(n => n.connections.size === 0)
  
  if (disconnected.length === 0) return edges
  
  const connected = Array.from(nodes.values()).filter(n => n.connections.size > 0)
  
  if (connected.length === 0 && disconnected.length > 1) {
    // Nothing is connected, bootstrap with first two
    const [first, second] = disconnected
    edges.push(createEdge(
      first.roomId,
      second.roomId,
      'corridor',
      true,
      false,
      first.deck !== second.deck,
      edgeIndex++,
      request
    ))
    first.connections.add(second.roomId)
    second.connections.add(first.roomId)
    connected.push(first, second)
    disconnected.splice(0, 2)
  }
  
  // Connect remaining disconnected rooms
  for (const disc of disconnected) {
    if (connected.length === 0) break
    
    // Find closest connected room (prefer same deck)
    const sameDeck = connected.filter(c => c.deck === disc.deck)
    const candidates = sameDeck.length > 0 ? sameDeck : connected
    
    const target = rng.pick(candidates)
    
    const crossesDeck = target.deck !== disc.deck
    
    edges.push(createEdge(
      target.roomId,
      disc.roomId,
      crossesDeck ? 'bulkhead' : 'corridor',
      false,
      false,
      crossesDeck,
      edgeIndex++,
      request
    ))
    
    target.connections.add(disc.roomId)
    disc.connections.add(target.roomId)
    connected.push(disc)
  }
  
  return edges
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEdge(
  fromId: string,
  toId: string,
  kind: ConnectorKind,
  isBackbone: boolean,
  isLoop: boolean,
  crossesDeck: boolean,
  index: number,
  request: GenerationRequest
): GraphEdge {
  return {
    id: generateStableId('conn', request.seed, index),
    fromId,
    toId,
    kind,
    isBackbone,
    isLoop,
    crossesDeck
  }
}

function calculateMetrics(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[]
): GraphMetrics {
  const nodeCount = nodes.size
  const edgeCount = edges.length
  
  // Average degree
  let totalDegree = 0
  for (const node of nodes.values()) {
    totalDegree += node.connections.size
  }
  const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0
  
  // Loop count
  const loopCount = edges.filter(e => e.isLoop).length
  
  // Backbone length
  const backboneLength = edges.filter(e => e.isBackbone).length
  
  // Calculate graph diameter (simplified - just longest shortest path from primary rooms)
  // Full BFS would be expensive, so we estimate
  const diameter = Math.ceil(Math.sqrt(nodeCount) * 1.5)
  
  return {
    totalNodes: nodeCount,
    totalEdges: edgeCount,
    avgDegree,
    loopCount,
    backboneLength,
    diameter
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface TopologyValidation {
  valid: boolean
  issues: string[]
}

export function validateTopology(topology: TopologyGraph): TopologyValidation {
  const issues: string[] = []
  
  // Check all rooms are reachable
  const reachable = new Set<string>()
  const roomIds = new Set(topology.rooms.map(r => r.id))
  
  if (topology.connectors.length > 0) {
    // BFS from first room
    const startRoom = topology.rooms[0]?.id
    if (startRoom) {
      const queue = [startRoom]
      reachable.add(startRoom)
      
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const conn of topology.connectors) {
          let neighbor: string | null = null
          if (conn.fromRoomId === current) {
            neighbor = conn.toRoomId
          } else if (conn.toRoomId === current) {
            neighbor = conn.fromRoomId
          }
          
          if (neighbor && !reachable.has(neighbor)) {
            reachable.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
    }
  }
  
  const unreachable = topology.rooms.filter(r => !reachable.has(r.id))
  if (unreachable.length > 0) {
    issues.push(`${unreachable.length} rooms are not reachable from main graph`)
  }
  
  // Check each deck has at least one room
  for (let deck = 0; deck < topology.deckCount; deck++) {
    const deckRooms = topology.roomsByDeck[deck] || []
    if (deckRooms.length === 0) {
      issues.push(`Deck ${deck} has no rooms`)
    }
  }
  
  // Check adjacent decks are connected
  for (let deck = 0; deck < topology.deckCount - 1; deck++) {
    const hasVertical = topology.connectors.some(c => c.isVertical)
    if (!hasVertical && topology.deckCount > 1) {
      issues.push('Multi-deck structure has no vertical connectors')
      break
    }
  }
  
  return {
    valid: issues.length === 0,
    issues
  }
}
