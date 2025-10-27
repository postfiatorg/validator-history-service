import config from '../utils/config'

interface Network {
  id: string
  port?: number
  entry: string
  unls: string[]
}

// UNL validators are now fetched directly from the rippled node via RPC
// The unls array is kept for backward compatibility but is no longer used for fetching
const networks: Network[] = [
  {
    id: 'test',
    entry: config.mainnet_p2p_server,
    port: 2559,
    unls: ['rpc'], // Indicates validators are fetched from RPC
  },
]

export default networks

export { Network }
