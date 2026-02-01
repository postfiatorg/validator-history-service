# API Endpoints

Base URL: `/v1` | Default Port: `3000`

---

## Health & Monitoring

### GET /v1/health
Returns the count of connected nodes for health monitoring.

**Response:**
```json
{ "count": 42 }
```

### GET /v1/metrics
Returns Prometheus-compatible metrics in plain text format.

**Response:**
```
connected_nodes{network="mainnet"} 42
connected_nodes{network="testnet"} 15
```

---

## Networks

### GET /v1/network/networks
Returns all configured networks.

**Response:**
```json
{
  "result": "success",
  "count": 2,
  "networks": [
    {
      "id": "mainnet",
      "entry": "https://node.example.com",
      "port": 51235,
      "unls": ["https://vl.example.com"]
    }
  ]
}
```

### POST /v1/network/get_network/:entryUrl
Fetches or creates a network by crawling an entry node. Attempts ports 51235, 2459, 30001, 443.

**Response:**
```json
{
  "result": "success",
  "network": "mainnet"
}
```

---

## Topology / Nodes

### GET /v1/network/topology
Returns complete network topology with all nodes.

**Response:**
```json
{
  "result": "success",
  "node_count": 150,
  "link_count": 0,
  "nodes": [...],
  "links": []
}
```

### GET /v1/network/topology/nodes
Returns all nodes crawled in the last hour.

**Response:**
```json
{
  "result": "success",
  "count": 150,
  "nodes": [
    {
      "node_public_key": "n9...",
      "networks": "mainnet",
      "ip": "1.2.3.4",
      "port": 51235,
      "version": "2.0.0",
      "uptime": 86400,
      "server_state": "full",
      "complete_ledgers": "32570-90000000",
      "lat": 37.7749,
      "long": -122.4194,
      "country": "United States",
      "country_code": 840,
      "region": "California",
      "city": "San Francisco",
      "io_latency_ms": 1,
      "load_factor_server": 256
    }
  ]
}
```

### GET /v1/network/topology/nodes/:network
Returns nodes filtered by network ID.

### GET /v1/network/topology/node/:publicKey
Returns a single node by its public key.

---

## Validators

> **Agreement Scores:** The validator endpoints below include live `agreement_1h`, `agreement_24h`, and `agreement_30day` fields that show ledger validation reliability. For day-by-day historical data, use the `/reports` endpoint.

### GET /v1/network/validators
Returns all active (non-revoked) validators with live agreement scores (1h, 24h, 30day).

**Response:**
```json
{
  "result": "success",
  "count": 35,
  "validators": [
    {
      "validation_public_key": "nH...",
      "signing_key": "n9...",
      "master_key": "nH...",
      "revoked": false,
      "domain": "validator.example.com",
      "domain_verified": true,
      "chain": "main",
      "networks": "mainnet",
      "current_index": 90000000,
      "ledger_hash": "ABC123...",
      "server_version": "2.0.0",
      "agreement_1h": { "missed": 0, "total": 100, "score": "1.00000", "incomplete": false },
      "agreement_24h": { "missed": 2, "total": 2400, "score": "0.99917", "incomplete": false },
      "agreement_30day": { "missed": 50, "total": 72000, "score": "0.99931", "incomplete": false },
      "partial": false,
      "unl": true,
      "amendments": [{ "id": "ABC...", "name": "Hooks" }],
      "base_fee": 10,
      "reserve_base": 10000000,
      "reserve_inc": 2000000
    }
  ]
}
```

### GET /v1/network/validators/:param
Returns validators filtered by network ID or UNL identifier. Includes live agreement scores.

### GET /v1/network/validator/:publicKey
Returns a single validator by master key or signing key with live agreement scores (1h, 24h, 30day). Returns 404 if not found.

**Response:**
```json
{
  "result": "success",
  "validation_public_key": "nH...",
  "signing_key": "n9...",
  "agreement_1h": { "missed": 0, "total": 100, "score": "1.00000", "incomplete": false },
  "agreement_24h": { "missed": 2, "total": 2400, "score": "0.99917", "incomplete": false },
  "agreement_30day": { "missed": 50, "total": 72000, "score": "0.99931", "incomplete": false },
  ...
}
```

### GET /v1/network/validator/:publicKey/manifests
Returns all manifests for a validator.

**Response:**
```json
{
  "result": "success",
  "count": 3,
  "reports": [
    {
      "master_key": "nH...",
      "signing_key": "n9...",
      "master_signature": "...",
      "signature": "...",
      "domain": "validator.example.com",
      "domain_verified": "true",
      "seq": "5"
    }
  ]
}
```

### GET /v1/network/validator/:publicKey/reports
Returns **daily historical** agreement score reports for a validator. Use this for historical trends; use `/validator/:publicKey` for live 1h/24h/30day scores.

**Response:**
```json
{
  "result": "success",
  "count": 30,
  "reports": [
    {
      "validation_public_key": "nH...",
      "date": "2024-01-15T00:00:00.000Z",
      "chain": "main",
      "score": "0.99917",
      "total": "2400",
      "missed": "2",
      "incomplete": false
    }
  ]
}
```

> **Note:** Each entry represents one day's aggregated agreement score. For live rolling windows (1h, 24h, 30day), use the validator endpoints above.

### GET /v1/network/validator/:publicKey/reports/hourly
Returns **hourly** agreement score reports for a validator. Useful for detailed charts and monitoring.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Number of days of hourly data to retrieve (max 30) |

**Example:** `/v1/network/validator/nHU.../reports/hourly?days=7`

**Response:**
```json
{
  "result": "success",
  "count": 168,
  "reports": [
    {
      "validation_public_key": "nH...",
      "start": "2024-01-15T14:00:00.000Z",
      "score": "1.00000",
      "total": "1199",
      "missed": "0",
      "incomplete": false
    }
  ]
}
```

> **Note:** Each entry represents one hour's agreement score. Data is retained for 30 days. Results are sorted by `start` descending (most recent first).

### GET /v1/network/validator_reports
Returns today's daily reports for all validators.

---

## Amendments

### GET /v1/network/amendments/info
Returns all amendments with general info, sorted by rippled version (descending).

**Response:**
```json
{
  "result": "success",
  "count": 50,
  "amendments": [
    {
      "id": "ABC123...",
      "name": "Hooks",
      "rippled_version": "2.0.0",
      "deprecated": false
    }
  ]
}
```

### GET /v1/network/amendment/info/:param
Returns a single amendment by ID or name. Returns 404 if not found.

### GET /v1/network/amendments/vote/:network
Returns all amendments with voting status for a network. Includes enabled amendments and those currently in voting.

**Response:**
```json
{
  "result": "success",
  "count": 50,
  "amendments": [
    {
      "id": "ABC123...",
      "name": "Hooks",
      "rippled_version": "2.0.0",
      "deprecated": false,
      "ledger_index": "90000000",
      "tx_hash": "DEF456...",
      "date": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "XYZ789...",
      "name": "NewFeature",
      "rippled_version": "2.1.0",
      "deprecated": false,
      "threshold": "17/20",
      "consensus": "85.00",
      "eta": "2024-02-15T00:00:00.000Z",
      "voted": {
        "count": 17,
        "validators": [
          { "signing_key": "n9...", "ledger_index": "90000000", "unl": true }
        ]
      }
    }
  ]
}
```

### GET /v1/network/amendment/vote/:network/:identifier
Returns voting info for a specific amendment on a network.

---

## Root

### GET /
Returns API info and list of all available endpoints.

**Response:**
```json
{
  "name": "Validator History Service",
  "version": "0.0.1-beta.0",
  "documentation": "...",
  "release_notes": "...",
  "endpoints": [
    { "action": "GET", "route": "/v1/health", "example": "/v1/health" }
  ]
}
```

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "result": "error",
  "message": "Description of the error"
}
```

**Status Codes:**
- `200` - Success
- `404` - Resource not found
- `500` - Internal server error

---

## Caching

Most endpoints cache responses for **60 seconds**. Node data includes nodes crawled in the **last hour**.
