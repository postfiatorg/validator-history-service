import migrations from '../database/migrations-config'

import {
  EnvironmentVariable,
  getEnvironmentVariable,
  getRequiredEnvironmentVariable,
} from './environment-variable'

type NodeEnv = 'development' | 'production' | 'test'

const nodeEnv = (getEnvironmentVariable(EnvironmentVariable.node_env) ??
  'development') as NodeEnv

const db = {
  client: getEnvironmentVariable(EnvironmentVariable.db) ?? 'pg',
  connection: {
    host: getEnvironmentVariable(EnvironmentVariable.host),
    user: getRequiredEnvironmentVariable(EnvironmentVariable.user),
    database: getRequiredEnvironmentVariable(EnvironmentVariable.database),
    password: getEnvironmentVariable(EnvironmentVariable.password),
  },
  // Increase waiting connection's timeout to 2 minutes since we are doing many parallel database connections - https://knexjs.org/guide/#acquireconnectiontimeout
  acquireConnectionTimeout: parseInt(
    getEnvironmentVariable(EnvironmentVariable.acquireConnectionTimeout) ??
      '120000',
    10,
  ),
  migrations,
}

const maxmind = {
  user: getEnvironmentVariable(EnvironmentVariable.maxmind_user),
  key: getEnvironmentVariable(EnvironmentVariable.maxmind_key),
}

const rippled_rpc_admin_server = getRequiredEnvironmentVariable(
  EnvironmentVariable.rippled_rpc_admin_server,
)

const mainnet_p2p_server = getRequiredEnvironmentVariable(
  EnvironmentVariable.mainnet_p2p_server,
)

const port = getEnvironmentVariable(EnvironmentVariable.port)

const addr = getEnvironmentVariable(EnvironmentVariable.addr)

const network_id = getRequiredEnvironmentVariable(
  EnvironmentVariable.network_id,
)

const FOURTEEN_DAYS_IN_MILLISECONDS = 1209600000

const amendment_majority_time = parseInt(
  getEnvironmentVariable(EnvironmentVariable.amendment_majority_time) ??
    String(FOURTEEN_DAYS_IN_MILLISECONDS),
  10,
)

const MAINNET_MAJORITY_THRESHOLD = 0.8

const amendment_majority_threshold = parseFloat(
  getEnvironmentVariable(EnvironmentVariable.amendment_majority_threshold) ??
    String(MAINNET_MAJORITY_THRESHOLD),
)

const DEFAULT_MAX_WS_CONNECTIONS = 20

const max_ws_connections = parseInt(
  getEnvironmentVariable(EnvironmentVariable.max_ws_connections) ??
    String(DEFAULT_MAX_WS_CONNECTIONS),
  10,
)

// An aggregated agreement score is flagged incomplete when fewer than this
// fraction of the window's expected hourly buckets are present.
const DEFAULT_AGREEMENT_COVERAGE_THRESHOLD = 0.9

const agreement_coverage_threshold = parseFloat(
  getEnvironmentVariable(EnvironmentVariable.agreement_coverage_threshold) ??
    String(DEFAULT_AGREEMENT_COVERAGE_THRESHOLD),
)

// An aggregated agreement score is flagged incomplete when more than this
// fraction of the present hourly buckets were themselves incomplete.
const DEFAULT_AGREEMENT_INCOMPLETE_SHARE_THRESHOLD = 0.25

const agreement_incomplete_share_threshold = parseFloat(
  getEnvironmentVariable(
    EnvironmentVariable.agreement_incomplete_share_threshold,
  ) ?? String(DEFAULT_AGREEMENT_INCOMPLETE_SHARE_THRESHOLD),
)

const config = {
  nodeEnv,
  db,
  maxmind,
  rippled_rpc_admin_server,
  port,
  addr,
  mainnet_p2p_server,
  network_id,
  amendment_majority_time,
  amendment_majority_threshold,
  max_ws_connections,
  agreement_coverage_threshold,
  agreement_incomplete_share_threshold,
}

export default config
