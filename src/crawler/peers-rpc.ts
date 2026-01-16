import axios from 'axios'

import { query } from '../shared/database'
import config from '../shared/utils/config'
import logger from '../shared/utils/logger'

const log = logger({ name: 'peers-rpc' })

interface PeerInfo {
  address: string
  public_key: string
}

interface PeersRpcResponse {
  result: {
    peers: PeerInfo[]
  }
}

/**
 * Parses address string to extract IP and port.
 *
 * @param address - Address in format "ip:port".
 * @returns Object with ip and port, or undefined if invalid.
 */
function parseAddress(
  address: string,
): { ip: string; port: number } | undefined {
  const parts = address.split(':')
  if (parts.length !== 2) {
    return undefined
  }

  const ip = parts[0]
  const port = Number(parts[1])

  if (Number.isNaN(port)) {
    return undefined
  }

  return { ip, port }
}

/**
 * Updates a single peer's IP in the crawls table.
 *
 * @param peer - Peer info with address and public_key.
 * @returns 1 if updated, 0 otherwise.
 */
async function updatePeerIp(peer: PeerInfo): Promise<number> {
  const parsed = parseAddress(peer.address)
  if (!parsed) {
    return 0
  }

  const { ip, port } = parsed
  const result = await query('crawls')
    .where('public_key', peer.public_key)
    .update({ ip, port })

  return result
}

/**
 * Fetches peer IPs via the RPC peers method and updates the crawls table.
 * This is a workaround for when the /crawl endpoint doesn't return IP addresses.
 */
export default async function fetchPeerIpsViaRpc(): Promise<void> {
  const rpcServer = config.rippled_rpc_admin_server

  if (!rpcServer) {
    log.warn('No RIPPLED_RPC_ADMIN configured, skipping peer IP fetch')
    return
  }

  try {
    log.info(`Fetching peer IPs via RPC from ${rpcServer}`)

    const response = await axios.post<PeersRpcResponse>(
      `https://${rpcServer}`,
      { method: 'peers' },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    )

    const peers = response.data.result.peers
    if (peers.length === 0) {
      log.info('No peers returned from RPC')
      return
    }

    log.info(`Found ${peers.length} peers via RPC, updating IPs...`)

    const updates = await Promise.all(peers.map(updatePeerIp))
    const updatedCount = updates.reduce((sum, val) => sum + val, 0)

    log.info(`Updated ${updatedCount} nodes with IP addresses`)
  } catch (err: unknown) {
    log.error('Error fetching peer IPs via RPC:', err)
  }
}
