# VHS Deployment Guide

This guide covers deploying the Validator History Service to a Vultr VPS for PostFiat networks.

## How Deployment Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     ONE-TIME SETUP (manual)                     │
│                                                                 │
│       Create VPS → Install Docker → Configure DNS               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ONGOING UPDATES (automated)                    │
│                                                                 │
│   Push to devnet branch  →  syncs configs → deploys to VPS      │
│   Push to testnet branch →  syncs configs → deploys to VPS      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Steps 1-4 below are done once per server.** After that, GitHub Actions workflows automatically sync config files and deploy new versions whenever code is pushed to the `devnet` or `testnet` branches.

## Branch Strategy

```
main (development)
  │
  ├──► devnet branch ──► auto-deploys to devnet VPS
  │
  └──► testnet branch ──► auto-deploys to testnet VPS
```

| Branch | Purpose | Deployment |
|--------|---------|------------|
| `main` | Development, PRs, code review | No auto-deploy |
| `devnet` | Devnet environment | Auto-deploys to devnet VPS |
| `testnet` | Testnet environment | Auto-deploys to testnet VPS |

**Workflow:**
1. Develop on `main` or feature branches
2. When ready for devnet: merge `main` → `devnet`
3. When ready for testnet: merge `main` → `testnet` (or `devnet` → `testnet`)

## Prerequisites

- Vultr account
- SSH key pair
- Domain access for DNS configuration

## VPS Specifications

Recommended specs for devnet/testnet:
- **CPU**: 1 vCPU
- **RAM**: 2 GB
- **Storage**: 50 GB SSD
- **OS**: Ubuntu 22.04 LTS

## Step 1: Create VPS in Vultr

1. Log in to [Vultr Dashboard](https://my.vultr.com/)
2. Click "Deploy New Server"
3. Select:
   - **Type**: Cloud Compute
   - **Location**: Choose based on proximity to validators
   - **Image**: Ubuntu 22.04 LTS x64
   - **Plan**: 1 vCPU, 2 GB RAM ($12/month tier or equivalent)
4. Add your SSH key under "SSH Keys"
5. Set hostname (e.g., `vhs-devnet` or `vhs-testnet`)
6. Click "Deploy Now"
7. Note the IP address once provisioned

## Step 2: Initial Server Setup

**From your local machine**, SSH into the new VPS:

```bash
ssh root@<VPS_IP>
```

**Now on the VPS**, run the setup script which installs Docker and configures the firewall:

```bash
curl -fsSL https://raw.githubusercontent.com/postfiatorg/validator-history-service/main/scripts/setup-vhs-server.sh | bash
```

<details>
<summary>Or run the steps manually</summary>

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
mkdir -p /opt/vhs
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable
```

</details>

After the script completes, **log out** of the VPS:

```bash
exit
```

## Step 3: Configure DNS

Add A records in your DNS provider (e.g., Squarespace, Cloudflare):

| Host/Name | Type | Value |
|-----------|------|-------|
| `vhs.devnet` | A | `<DEVNET_VPS_IP>` |
| `vhs.testnet` | A | `<TESTNET_VPS_IP>` |

Your DNS provider appends your domain automatically, so `vhs.devnet` becomes `vhs.devnet.postfiat.org`.

## Step 4: Trigger Initial Deploy

The CI/CD workflow will sync all config files and start services. Trigger it by pushing to the appropriate branch:

```bash
# For devnet
git checkout devnet
git push origin devnet

# For testnet
git checkout testnet
git push origin testnet
```

Or trigger manually via GitHub Actions → Deploy Devnet/Testnet → Run workflow.

## Step 5: Verify Deployment

Check containers are running:

```bash
docker ps
```

Expected output shows 5 containers: `vhs-postgres`, `vhs-crawler`, `vhs-connections`, `vhs-api`, `vhs-promtail`

Test API health:

```bash
curl localhost:3000/v1/health
```

Or from external:

```bash
curl http://vhs.devnet.postfiat.org:3000/v1/health
```

## Monitoring

### Centralized Logging

Both devnet and testnet deployments include Promtail, which sends logs to their respective centralized monitoring instances.

| Environment | Loki URL | Grafana URL |
|-------------|----------|-------------|
| Devnet | `http://infra-monitoring.devnet.postfiat.org:3100` | `http://infra-monitoring.devnet.postfiat.org:3001` |
| Testnet | `http://infra-monitoring.testnet.postfiat.org:3100` | `http://infra-monitoring.testnet.postfiat.org:3001` |

**Loki URL Configuration:**

To override the default Loki URL:

```bash
export LOKI_URL=http://your-loki-host:3100
docker compose up -d
```

**Accessing Logs:**

View VHS logs in the centralized Grafana dashboard. See the [infra-monitoring](https://github.com/postfiatorg/infra-monitoring) repo for details.

### Command Line Logs

View logs directly via Docker:

```bash
# All services
docker compose logs -f

# Specific service
docker logs -f vhs-api
docker logs -f vhs-crawler
docker logs -f vhs-connections
```

### Database Access

```bash
docker exec -it vhs-postgres psql -U vhs_user -d validator_history_db
```

## Updating

Pull latest image and restart:

```bash
cd /opt/vhs
docker compose pull
docker compose up -d
```

## Resetting VHS (Validator Redeployments)

When validators are destroyed and redeployed with new keys, VHS will see them as new validators while old data persists. For devnet and testnet, it's cleanest to reset VHS to start fresh.

**On the VPS:**

```bash
curl -fsSL https://raw.githubusercontent.com/postfiatorg/validator-history-service/main/scripts/reset-vhs.sh | bash
```

This script:
1. Stops all containers
2. Deletes the database (wipes all historical data)
3. Pulls latest images
4. Restarts services
5. Waits for health check

**From another workflow (e.g., validator deployment):**

```yaml
- name: Reset VHS
  uses: appleboy/ssh-action@v1.0.3
  with:
    # Use VULTR_DEVNET_HOST for devnet, VULTR_TESTNET_HOST for testnet
    host: ${{ secrets.VULTR_DEVNET_HOST }}
    username: root
    key: ${{ secrets.VULTR_SSH_KEY }}
    script: |
      curl -fsSL https://raw.githubusercontent.com/postfiatorg/validator-history-service/main/scripts/reset-vhs.sh | bash
```

**Order of operations for validator redeployment:**
1. Destroy old validators
2. Reset VHS (clears old data)
3. Deploy new validators
4. VHS automatically picks up new network

## Troubleshooting

### Containers not starting
Check logs for errors:
```bash
docker compose logs
```

### Database connection issues
Verify postgres is healthy:
```bash
docker exec vhs-postgres pg_isready -U vhs_user
```

### API not responding
Check if port 3000 is open:
```bash
ufw status
curl localhost:3000
```

## CI/CD Auto-Deployment

After initial setup, you don't need to touch the server manually. GitHub Actions handles everything:

| Trigger | Workflow | What happens |
|---------|----------|--------------|
| Push to `devnet` | `deploy-devnet.yml` | Tests → Builds image → Pushes to Docker Hub → Syncs configs → Restarts containers |
| Push to `testnet` | `deploy-testnet.yml` | Tests → Builds image → Pushes to Docker Hub → Syncs configs → Restarts containers |

**What gets synced automatically:**
- `scripts/docker-compose.*.yml` → `/opt/vhs/docker-compose.yml`
- `scripts/monitoring/` → `/opt/vhs/monitoring/`

To deploy, merge your changes to the appropriate branch:

```bash
# Deploy to devnet
git checkout devnet
git merge main
git push origin devnet

# Deploy to testnet
git checkout testnet
git merge main
git push origin testnet
```

### Required GitHub Secrets

Configure these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Value | Example |
|--------|-------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub username | `dravlic` |
| `DOCKERHUB_TOKEN` | Docker Hub access token | (from Docker Hub settings) |
| `VULTR_DEVNET_HOST` | Devnet VPS IP address | `149.28.xxx.xxx` |
| `VULTR_TESTNET_HOST` | Testnet VPS IP address | `45.76.xxx.xxx` |
| `VULTR_SSH_USER` | SSH username | `root` |
| `VULTR_SSH_KEY` | Private SSH key (full content) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
