# PostFiat Validator History Service

[![Node.js CI](https://github.com/postfiatorg/validator-history-service/actions/workflows/node.js.yml/badge.svg)](https://github.com/postfiatorg/validator-history-service/actions/workflows/node.js.yml)

Service for ingesting, aggregating, storing, and disbursing validator and node data for PostFiat networks.

Fork of [Ripple Validator History Service](https://github.com/ripple/validator-history-service) adapted for PostFiat. See [docs/POSTFIAT.md](docs/POSTFIAT.md) for differences.

## Quick Start

### Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/postfiatorg/validator-history-service.git
cd validator-history-service

# Start all services (devnet)
docker compose -f scripts/docker-compose.devnet.yml up -d

# Check status
docker ps
curl localhost:3000/v1/health
```

### Local Development

```bash
# Install dependencies
npm ci

# Copy environment file
cp .env.devnet .env

# Start PostgreSQL (via Docker or local install)
docker run -d --name vhs-postgres \
  -e POSTGRES_USER=vhs_user \
  -e POSTGRES_PASSWORD=vhs_password \
  -e POSTGRES_DB=validator_history_db \
  -p 5432:5432 postgres:16-alpine

# Build
npm run build

# Run services (in separate terminals)
npm run startApiDev
npm run startCrawlerDev
npm run startConnectionsDev
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_USER` | Database user | `vhs_user` |
| `DB_PASSWORD` | Database password | `vhs_password` |
| `DB_DATABASE` | Database name | `validator_history_db` |
| `MAINNET_P2P_ENTRY` | Network entry point for crawler | `rpc.devnet.postfiat.org` |
| `RIPPLED_RPC_ADMIN` | Rippled admin RPC endpoint | `rpc.devnet.postfiat.org:5006` |
| `NETWORK_ID` | Network identifier | `dev`, `test`, `main` |
| `MAXMIND_USER` | MaxMind account (optional) | - |
| `MAXMIND_KEY` | MaxMind license key (optional) | - |

Pre-configured environment files: `.env.devnet`, `.env.testnet`, `.env.mainnet`

## API

The API runs on port 3000 by default.

```bash
# Health check
curl localhost:3000/v1/health

# List validators
curl localhost:3000/v1/validators

# Network topology
curl localhost:3000/v1/network/topology
```

## Branch Strategy

| Branch | Purpose | Auto-Deploy |
|--------|---------|-------------|
| `main` | Development and PRs | - |
| `devnet` | Devnet releases | → devnet VPS |
| `testnet` | Testnet releases | → testnet VPS |

Merge to `devnet` or `testnet` to trigger deployment.

## Documentation

- [Architecture](ARCHITECTURE.md) - System design and components
- [PostFiat Specifics](docs/POSTFIAT.md) - Network details and upstream differences
- [Deployment](docs/DEPLOYMENT.md) - Vultr VPS deployment guide
- [Contributing](CONTRIBUTING.md) - Development guidelines

## License

ISC
