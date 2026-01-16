# Developer Instructions - Validator History Service (VHS)

This guide covers everything you need to run VHS locally for development.

## Prerequisites

- **Node.js** 18+ (recommended: 22)
- **Docker** (for PostgreSQL)
- **npm**

## Quick Start

```bash
# 1. Start PostgreSQL
docker run -d \
  --name vhs-postgres \
  -e POSTGRES_USER=vhs_user \
  -e POSTGRES_PASSWORD='vhs_password.' \
  -e POSTGRES_DB=validator_history_db \
  -p 5432:5432 \
  postgres:15

# 2. Copy environment config (choose one)
cp .env.testnet .env    # For testnet
cp .env.mainnet .env    # For mainnet
cp .env.devnet .env     # For devnet

# 3. Install dependencies
npm install

# 4. Start services (in separate terminals)
npm run startApiDev           # Terminal 1: API server
npm run startConnectionsDev   # Terminal 2: Validator tracking
npm run startCrawlerDev       # Terminal 3: Node discovery

# 5. Test
curl http://localhost:3000/v1/health
```

## Architecture Overview

VHS consists of three independent processes:

| Process | Command | Purpose |
|---------|---------|---------|
| **API** | `npm run startApiDev` | HTTP server on port 3000 |
| **Connection Manager** | `npm run startConnectionsDev` | Connects to rippled, tracks validators, validations, amendments |
| **Crawler** | `npm run startCrawlerDev` | Discovers nodes, crawls network topology |

### What each process populates:

| Process | Database Tables |
|---------|-----------------|
| Connection Manager | `validators`, `manifests`, `amendments_*`, `connection_health`, `hourly_agreement`, `daily_agreement`, `ballot` |
| Crawler | `crawls`, `location` |

## Database Setup (Detailed)

### Option 1: Docker (Recommended)

```bash
# Start PostgreSQL container
docker run -d \
  --name vhs-postgres \
  -e POSTGRES_USER=vhs_user \
  -e POSTGRES_PASSWORD='vhs_password.' \
  -e POSTGRES_DB=validator_history_db \
  -p 5432:5432 \
  postgres:15

# Verify it's running
docker ps | grep vhs-postgres

# Stop when done
docker stop vhs-postgres

# Start again later
docker start vhs-postgres

# Remove completely
docker rm -f vhs-postgres
```

### Option 2: Local PostgreSQL

```bash
# macOS with Homebrew
brew install postgresql@15
brew services start postgresql@15
createdb validator_history_db
```

### Database Schema

Tables are created automatically on first run of `startConnectionsDev` or `startCrawlerDev`. No manual migration needed.

## Environment Configuration

The `.env` file controls which network VHS connects to. Pre-configured options:

| File | Network | RPC Endpoint |
|------|---------|--------------|
| `.env.testnet` | Testnet | rpc.testnet.postfiat.org |
| `.env.mainnet` | Mainnet | rpc.mainnet.postfiat.org |
| `.env.devnet` | Devnet | rpc.devnet.postfiat.org |

### Key Environment Variables

```bash
# Database (must match Docker setup)
DB_HOST=localhost
DB_USER=vhs_user
DB_PASSWORD=vhs_password.
DB_DATABASE=validator_history_db

# Network endpoints
RIPPLED_RPC_ADMIN=rpc.testnet.postfiat.org:5006
MAINNET_P2P_ENTRY=rpc.testnet.postfiat.org
MAINNET_UNL=postfiat.org/testnet_vl.json
```

## Running the Services

### Development Mode (with hot reload)

```bash
# API only (minimal - serves HTTP endpoints)
npm run startApiDev

# API + Connection Manager (tracks validators)
npm run startApiDev & npm run startConnectionsDev

# All three (full functionality)
npm run startApiDev & npm run startConnectionsDev & npm run startCrawlerDev
```

### What you need for different use cases:

| Use Case | Required Processes |
|----------|-------------------|
| Just UNL validators (`/v1/network/unl`) | API only |
| Validator list with details | API + Connection Manager |
| Network topology / nodes | API + Crawler |
| Full functionality | All three |

## API Endpoints

Base URL: `http://localhost:3000`

### Health & Monitoring
| Endpoint | Description |
|----------|-------------|
| `GET /v1/health` | Connected nodes count |
| `GET /v1/metrics` | Prometheus-format metrics |

### Networks
| Endpoint | Description |
|----------|-------------|
| `GET /v1/network/networks` | List of all configured networks |
| `GET /v1/network/unl` | UNL validator public keys (direct from UNL URL) |

### Validators
| Endpoint | Description |
|----------|-------------|
| `GET /v1/network/validators` | All validators with agreement scores |
| `GET /v1/network/validators/{network}` | Validators filtered by network |
| `GET /v1/network/validator/{pubkey}` | Single validator details |
| `GET /v1/network/validator/{pubkey}/manifests` | Validator manifest history |
| `GET /v1/network/validator/{pubkey}/ballot` | Validator's amendment votes and fee settings |
| `GET /v1/network/validator/{pubkey}/reports` | Validator agreement reports |
| `GET /v1/network/validator_reports` | Daily reports for all validators |

### Topology / Nodes
| Endpoint | Description |
|----------|-------------|
| `GET /v1/network/topology` | Network topology overview |
| `GET /v1/network/topology/nodes` | All discovered nodes |
| `GET /v1/network/topology/nodes/{network}` | Nodes filtered by network |
| `GET /v1/network/topology/node/{pubkey}` | Single node details |

### Amendments
| Endpoint | Description |
|----------|-------------|
| `GET /v1/network/amendments/info` | All amendments info |
| `GET /v1/network/amendment/info/{id}` | Single amendment info |
| `GET /v1/network/amendments/vote/{network}` | Amendment voting status |
| `GET /v1/network/amendment/vote/{network}/{id}` | Single amendment vote details |

## Troubleshooting

### "relation does not exist" errors
**Cause:** Database tables not created yet.
**Fix:** Run `npm run startConnectionsDev` at least once to create tables.

### `/v1/network/validators` returns 0 validators
**Cause:** Connection manager not running or hasn't received validations yet.
**Fix:**
1. Run `npm run startConnectionsDev`
2. Wait 1-2 minutes for validators to send validations

### `/v1/network/topology/nodes` returns 0 nodes
**Cause:** Crawler not running, or crawl data is older than 1 hour.
**Fix:** Run `npm run startCrawlerDev` to refresh node data.

### Connection refused errors in logs
**Cause:** Some WebSocket ports may be unavailable.
**Fix:** This is normal - VHS tries multiple ports and uses whichever connects. Check logs for "Websocket connection opened" messages.

### Database connection errors
**Cause:** PostgreSQL not running or wrong credentials.
**Fix:**
```bash
# Check if PostgreSQL is running
docker ps | grep vhs-postgres

# If not running, start it
docker start vhs-postgres
```

## Development Commands

```bash
# Build TypeScript
npm run build

# Lint code
npm run lint        # Fix issues
npm run lint:ci     # Check only (CI mode)

# Run tests
npm test
```

## Database Inspection

```bash
# Connect to database
docker exec -it vhs-postgres psql -U vhs_user -d validator_history_db

# Useful queries
SELECT COUNT(*) FROM validators;
SELECT COUNT(*) FROM crawls;
SELECT * FROM connection_health WHERE connected = true;
SELECT * FROM networks;

# Exit psql
\q
```

## Stopping Everything

```bash
# Stop Node processes
Ctrl+C in each terminal

# Stop PostgreSQL
docker stop vhs-postgres

# Remove PostgreSQL (deletes all data)
docker rm -f vhs-postgres
```

## Notes

- The `/v1/network/unl` endpoint fetches directly from the UNL URL and doesn't require the database or connection manager.
- Agreement scores (`agreement_1h`, `agreement_24h`, `agreement_30day`) require the connection manager to run continuously for 1h, 24h, or 30 days respectively to accumulate data.
- Node topology data expires after 1 hour. Keep the crawler running for fresh data.
