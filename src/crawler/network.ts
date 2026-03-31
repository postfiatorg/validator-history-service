/* eslint-disable @typescript-eslint/no-unsafe-assignment -- TODO: add type for Peer Crawler to remove eslint-disable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- TODO: add type for Peer Crawler to remove eslint-disable */
/* eslint-disable @typescript-eslint/no-unsafe-call -- TODO: add type for Peer Crawler to remove eslint-disable */
/* eslint-disable no-unsafe-optional-chaining -- TODO: add type for Peer Crawler to remove eslint-disable */
import dns from 'dns'
import https from 'https'
import { isIP } from 'net'
import { promisify } from 'util'

import axios, { AxiosInstance } from 'axios'

import { Crawl, Node } from '../shared/types'
import { getIPv4Address } from '../shared/utils'
import logger from '../shared/utils/logger'

let fetch: AxiosInstance | undefined

const log = logger({ name: 'crawl' })
const VERSION_PREFIX = 'postfiatd-'

/**
 * Strips the "postfiatd-" prefix from version strings reported by the daemon's
 * /crawl endpoint. Older binaries include the prefix in overlay peer data via
 * HTTP headers; newer binaries do not. Normalizing here ensures crawls.version
 * stores bare semver regardless of which daemon version reported the data.
 *
 * @param version - Raw version string from the /crawl response.
 * @returns Version string without the software name prefix.
 */
function normalizeVersion(version: string | undefined): string {
  if (!version) {
    return ''
  }
  return version.startsWith(VERSION_PREFIX)
    ? version.slice(VERSION_PREFIX.length)
    : version
}
const dnsLookup = promisify(dns.lookup)

/**
 * Gets Axios Instance, creates if not instantiated.
 *
 * @returns An initialized AxiosInstance.
 */
function getAxiosInstance(): AxiosInstance {
  if (fetch) {
    return fetch
  }

  fetch = axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
      requestCert: true,
    }),
  })

  return fetch
}

const TIMEOUT = 6000

/**
 * Crawl endpoint at host:port/crawl.
 *
 * @param host - Hostname or ip address of peer.
 * @param port - Port to hit /crawl endpoint.
 * @returns A list of Nodes.
 */
async function crawlNode(
  host: string,
  port: number,
): Promise<Crawl | undefined> {
  return getAxiosInstance()
    .get(`https://${host}:${port}/crawl`, { timeout: TIMEOUT })
    .then(async (response) => {
      const active_nodes = response.data?.overlay?.active
      const {
        pubkey_node: public_key,
        server_state,
        io_latency_ms,
        load_factor_server,
        uptime,
        build_version,
        complete_ledgers,
      } = response.data?.server

      if (active_nodes === undefined) {
        return undefined
      }

      let resolvedIp: string
      if (isIP(host)) {
        resolvedIp = getIPv4Address(host)
      } else {
        try {
          const result = await dnsLookup(host, { family: 4 })
          resolvedIp = result.address
        } catch {
          resolvedIp = host
        }
      }

      const version = normalizeVersion(build_version)
      const normalizedPeers = active_nodes.map((node: Node) => ({
        ...node,
        version: normalizeVersion(node.version),
      }))

      const this_node: Node = {
        public_key,
        ip: resolvedIp,
        port,
        server_state,
        io_latency_ms,
        load_factor_server,
        uptime,
        version,
        complete_ledgers,
      }

      const validatorSites = response.data?.unl?.validator_sites ?? []

      const crawl: Crawl = {
        this_node,
        active_nodes: normalizedPeers,
        node_unl:
          validatorSites.length > 0
            ? validatorSites[0].uri.replace(/^https?:\/\//u, '')
            : undefined,
      }

      return crawl
    })
    .catch((error) => {
      if (error.message.includes('wrong network')) {
        throw error
      }
      if (!error.isAxiosError) {
        log.error(error)
      }
      return undefined
    })
}

export default crawlNode
