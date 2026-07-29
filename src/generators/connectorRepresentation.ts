import type {
  ConnectorRepresentation,
  LayoutConnector,
} from './types'

export function normalizeConnectorRepresentation(
  connector: Pick<LayoutConnector, 'id' | 'representation'>,
): ConnectorRepresentation {
  if (connector.representation) {
    return connector.representation
  }

  return connector.id.startsWith('corridor-edge-')
    ? 'physical-topology-edge-v1'
    : 'room-route-v1'
}
