/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Disable since websocket messages are indeterministic */

import WebSocket from 'ws'

import { query, getNetworks, getNodes } from '../shared/database'
import { fetchAmendmentInfo } from '../shared/database/amendments'
import {
  clearConnectionHealthDb,
  getTotalConnectedNodes,
  isNodeConnectedByIp,
  isNodeConnectedByPublicKey,
  isNodeConnectedByWsUrl,
  saveConnectionHealth,
  updateConnectionHealthStatus,
} from '../shared/database/connectionHealth'
import { FeeVote, WsNode } from '../shared/types'
import { getIPv4Address } from '../shared/utils'
import config from '../shared/utils/config'
import logger from '../shared/utils/logger'

import selectConnectionTargets from './peer-selection'
import {
  backtrackAmendmentStatus,
  fetchAmendmentsFromLedgerEntry,
  handleWsMessageSubscribeTypes,
  subscribe,
} from './wsHandling'

const log = logger({ name: 'connections' })

// PostFiat networks (dev, test) only expose wss:// on port 6005
// Other networks may use various ports/protocols
const POSTFIAT_NETWORKS = ['dev', 'test']
const POSTFIAT_PORTS = [6005]
const POSTFIAT_PROTOCOLS = ['wss://']

const DEFAULT_PORTS = [443, 6005, 6006, 6007, 51233, 51234]
const DEFAULT_PROTOCOLS = ['wss://', 'ws://']

/**
 * Get WebSocket ports to try based on network type.
 *
 * @param network - The network identifier (e.g., 'dev', 'test').
 * @returns Array of ports to try for the given network.
 */
function getPortsForNetwork(network: string): number[] {
  return POSTFIAT_NETWORKS.includes(network) ? POSTFIAT_PORTS : DEFAULT_PORTS
}

/**
 * Get WebSocket protocols to try based on network type.
 *
 * @param network - The network identifier (e.g., 'dev', 'test').
 * @returns Array of protocols to try for the given network.
 */
function getProtocolsForNetwork(network: string): string[] {
  return POSTFIAT_NETWORKS.includes(network)
    ? POSTFIAT_PROTOCOLS
    : DEFAULT_PROTOCOLS
}

/**
 * Derives WebSocket URL from RPC hostname.
 * Replaces 'rpc.' prefix with 'ws.' prefix for Caddy-proxied WebSocket connections.
 *
 * @param hostname - The RPC hostname (e.g., 'rpc.devnet.postfiat.org').
 * @returns The WebSocket URL (e.g., 'wss://ws.devnet.postfiat.org').
 */
function deriveWsUrl(hostname: string): string {
  if (hostname.startsWith('rpc.')) {
    return `wss://${hostname.replace('rpc.', 'ws.')}`
  }
  return ''
}
const networkFee: Map<string, FeeVote> = new Map()
const validationNetworkDb: Map<string, string> = new Map()
const enableAmendmentLedgerIndexMap: Map<string, number> = new Map()
const CM_INTERVAL = 60 * 60 * 1000
const WS_TIMEOUT = 10000
// PostFiat peers serve rippled's self-signed certificate on the public WS port.
// Validation authenticity comes from validator signatures, not TLS, so peer
// connections accept self-signed certs the same way the crawler's HTTPS agent
// already does. Without this, only the CA-fronted entry node connects.
const WS_OPTIONS: WebSocket.ClientOptions = {
  handshakeTimeout: WS_TIMEOUT,
  rejectUnauthorized: false,
}
const REPORTING_INTERVAL = 15 * 60 * 1000
const BACKTRACK_INTERVAL = 30 * 60 * 1000
const BASE_RETRY_DELAY = 1 * 1000
const MAX_RETRY_DELAY = 30 * 1000
const HEARTBEAT_INTERVAL = 30 * 1000

// The frequent closing codes seen so far after connections established include:
//  1008: Policy error: client is too slow. (Most frequent)
//  1006: Abnormal Closure: The connection was closed abruptly without a proper handshake or a clean closure.
//  1005: No Status Received: An empty or undefined status code is used to indicate no further details about the closure.
// Reconnection should happen after seeing these codes for established connections.
const CLOSING_CODES = [1005, 1006, 1008]
let cmStarted = false

/**
 * Sets the handlers for each WebSocket object.
 *
 * @param ws - A WebSocket object.
 * @param publicKey - The public key of the node that we are trying to connect. See {@link https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_info#response-format | pubkey_node}.
 * @param network - The network of the node we are trying to reach where it retrieves validations.
 * @param retryCount - Retry count for exponential backoff.
 * @returns A Promise that resolves to void once a connection has been created or timeout has occured.
 */
async function setHandlers(
  ws: WebSocket,
  publicKey: string | undefined,
  network: string,
  retryCount = 0,
): Promise<void> {
  const ledger_hashes: string[] = []
  let heartbeatInterval: NodeJS.Timeout | undefined

  return new Promise(function setHandlersPromise(resolve, _reject) {
    ws.on('open', async () => {
      log.info(`Websocket connection opened for: ${ws.url} on ${network}`)

      if (await isNodeConnectedByWsUrl(ws.url)) {
        ws.close()
        resolve()
        return
      }
      void saveConnectionHealth({
        ws_url: ws.url,
        public_key: publicKey,
        network,
        connected: true,
        status_update_time: new Date(),
      })
      subscribe(ws)

      let pongReceived = true
      ws.on('pong', () => {
        pongReceived = true
      })
      heartbeatInterval = setInterval(() => {
        if (!pongReceived) {
          log.warn(
            `No pong received from ${ws.url}, terminating dead connection`,
          )
          ws.terminate()
          return
        }
        pongReceived = false
        ws.ping()
      }, HEARTBEAT_INTERVAL)

      resolve()
    })
    ws.on('message', function handleMessage(message: string) {
      let data
      try {
        data = JSON.parse(message)
      } catch (error: unknown) {
        log.error('Error parsing validation message', error)
        return
      }

      void handleWsMessageSubscribeTypes(
        data,
        ledger_hashes,
        network,
        networkFee,
        ws,
        validationNetworkDb,
        enableAmendmentLedgerIndexMap,
      )
    })
    ws.on('close', async (code) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      void updateConnectionHealthStatus(ws.url, false)
      ws.terminate()

      const delay = BASE_RETRY_DELAY * 2 ** retryCount

      if (CLOSING_CODES.includes(code) && delay <= MAX_RETRY_DELAY) {
        log.info(`Reconnecting to ${ws.url} on ${network} after ${delay}ms...`)

        setTimeout(async () => {
          // Open a new Websocket connection for the same url
          const newWS = new WebSocket(ws.url, WS_OPTIONS)

          await setHandlers(newWS, publicKey, network, retryCount + 1)
        }, delay)
      }

      resolve()
    })
    ws.on('error', () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      void updateConnectionHealthStatus(ws.url, false)
      ws.terminate()
      resolve()
    })
  })
}

/**
 * Tries to find a valid WebSockets endpoint for a node.
 *
 * @param node - The node we are trying to connect to.
 * @returns A promise that resolves to void once a valid endpoint to the node has been found or timeout occurs.
 */
async function findConnection(node: WsNode): Promise<void> {
  const ipv4 = getIPv4Address(node.ip)
  if (ipv4.search(':') !== -1) {
    return Promise.resolve()
  }
  node.ip = ipv4

  if (node.public_key && (await isNodeConnectedByPublicKey(node.public_key))) {
    return Promise.resolve()
  }

  if (!node.public_key && (await isNodeConnectedByIp(node.ip))) {
    return Promise.resolve()
  }

  if (node.ws_url) {
    const ws = new WebSocket(node.ws_url, WS_OPTIONS)
    return setHandlers(ws, node.public_key, node.networks)
  }

  const ports = getPortsForNetwork(node.networks)
  const protocols = getProtocolsForNetwork(node.networks)

  const promises: Array<Promise<void>> = []
  for (const port of ports) {
    for (const protocol of protocols) {
      const url = `${protocol}${node.ip}:${port}`
      const ws = new WebSocket(url, WS_OPTIONS)
      promises.push(setHandlers(ws, node.public_key, node.networks))
    }
  }
  await Promise.all(promises)
  return Promise.resolve()
}

async function getValidationNetworkDb(): Promise<void> {
  const validatorNetwork: Array<{ signing_key: string; networks: string }> =
    await query('validators').select('signing_key', 'networks')
  for (const entry of validatorNetwork) {
    validationNetworkDb.set(entry.signing_key, entry.networks)
  }
}

/**
 * Creates connections to nodes found in the database.
 *
 * @returns A promise that resolves to void once all possible connections have been created.
 */
async function createConnections(): Promise<void> {
  log.info('Finding Connections...')
  validationNetworkDb.clear()
  await getValidationNetworkDb()
  const tenMinutesAgo = new Date()
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10)

  const peers = await getNodes(tenMinutesAgo)

  const networksDb = await getNetworks()
  const entries: WsNode[] = networksDb.map((network) => ({
    ip: network.entry,
    ws_url: deriveWsUrl(network.entry),
    networks: network.id,
  }))

  const targets = selectConnectionTargets(
    entries,
    peers,
    config.max_ws_connections,
  )

  await Promise.all(targets.map(async (node) => findConnection(node)))

  log.info(
    `${await getTotalConnectedNodes()} connections established (targeting ${
      targets.length
    } of ${peers.length + entries.length} known nodes)`,
  )
}

setInterval(async () => {
  log.info(`${await getTotalConnectedNodes()} connections established`)
}, REPORTING_INTERVAL)

/**
 * Starts the connection manager and refreshes connections every CM_INTERVAL.
 *
 * @returns Void.
 */
export default async function startConnections(): Promise<void> {
  if (!cmStarted) {
    cmStarted = true
    await fetchAmendmentInfo()
    await clearConnectionHealthDb()
    await fetchAmendmentsFromLedgerEntry()
    await createConnections()
    await backtrackAmendmentStatus()

    setInterval(() => {
      void fetchAmendmentInfo()
      void fetchAmendmentsFromLedgerEntry()
      void createConnections()
    }, CM_INTERVAL)

    setInterval(() => {
      void backtrackAmendmentStatus()
    }, BACKTRACK_INTERVAL)
  }
}
