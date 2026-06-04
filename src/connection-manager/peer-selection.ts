import { WsNode } from '../shared/types'

/**
 * Selects which nodes to open WebSocket connections to.
 *
 * Network entry nodes are always kept as anchors — they are the most reliable
 * endpoints and present CA-issued certificates. The remaining slots up to
 * maxConnections are filled with the highest-uptime crawled peers. Each peer
 * relays the whole network's validation stream, so a bounded set is enough for
 * full coverage and redundancy without the message volume growing with the
 * validator count. Selection is deterministic so the connection set stays
 * stable across cycles instead of churning and reintroducing gaps.
 *
 * @param entries - Network entry nodes, always connected as anchors.
 * @param peers - Crawled peer nodes available to connect to.
 * @param maxConnections - Maximum number of nodes to connect to.
 * @returns The bounded, ordered list of nodes to connect to.
 */
export default function selectConnectionTargets(
  entries: WsNode[],
  peers: WsNode[],
  maxConnections: number,
): WsNode[] {
  if (maxConnections <= entries.length) {
    return entries.slice(0, maxConnections)
  }

  const remainingSlots = maxConnections - entries.length
  const peersByUptime = Array.from(peers).sort(
    (nodeA, nodeB) => (nodeB.uptime ?? 0) - (nodeA.uptime ?? 0),
  )

  return [...entries, ...peersByUptime.slice(0, remainingSlots)]
}
