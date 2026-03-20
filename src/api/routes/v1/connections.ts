import { Request, Response } from 'express'

import { query } from '../../../shared/database'
import logger from '../../../shared/utils/logger'

const log = logger({ name: 'api-connections' })

/**
 * Extracts the IP address from a WebSocket URL.
 *
 * @param wsUrl - WebSocket URL (e.g., 'wss://144.202.24.188:6005').
 * @returns The IP address, or null if parsing fails.
 */
function extractIp(wsUrl: string): string | null {
  try {
    const url = new URL(wsUrl)
    return url.hostname || null
  } catch (_err) {
    return null
  }
}

/**
 * Returns validator connection data with resolved IP addresses.
 *
 * Queries connection_health joined with validators to provide a mapping
 * of validator signing keys to their IP addresses. Used by the scoring
 * pipeline to enrich validator profiles with geographic and ASN data.
 *
 * @param _req - HTTP request object.
 * @param res - Response containing validator connections with IPs.
 */
export default async function handleConnections(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const rows = (await query('connection_health')
      .select([
        'connection_health.public_key',
        'connection_health.ws_url',
        'connection_health.connected',
      ])
      .where('connection_health.connected', '=', true)) as Array<{
      public_key: string
      ws_url: string
      connected: boolean
    }>

    const connections = rows
      .map((row) => ({
        public_key: row.public_key,
        ip: extractIp(row.ws_url),
        connected: row.connected,
      }))
      .filter((conn) => conn.ip !== null)

    res.status(200).send({
      result: 'success',
      count: connections.length,
      connections,
    })
  } catch (err: unknown) {
    log.error('Error handleConnections: ', err)
    res.status(500).send({
      result: 'error',
      message: `internal error: ${(err as Error).message}`,
    })
  }
}
