# VHS Deployment Guide

This guide covers deploying the Validator History Service to a Vultr VPS for PostFiat networks.

## How Deployment Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     ONE-TIME SETUP (manual)                     │
│                                                                 │
│   Create VPS → Install Docker → Copy docker-compose → DNS       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ONGOING UPDATES (automated)                    │
│                                                                 │
│   Push to devnet branch  →  deploys to devnet VPS               │
│   Push to testnet branch →  deploys to testnet VPS              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Steps 1-5 below are done once per server.** After that, GitHub Actions workflows automatically deploy new versions whenever code is pushed to the `devnet` or `testnet` branches.

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

## Step 3: Deploy VHS

**From your local machine** (in the cloned repository directory), copy the docker-compose file to the VPS:

**For Devnet:**
```bash
scp scripts/docker-compose.devnet.yml root@<VPS_IP>:/opt/vhs/docker-compose.yml
```

**For Testnet:**
```bash
scp scripts/docker-compose.testnet.yml root@<VPS_IP>:/opt/vhs/docker-compose.yml
```

**SSH back into the VPS** and start the services:

```bash
ssh root@<VPS_IP>
cd /opt/vhs
docker compose up -d
```

## Step 4: Configure DNS

Add A records in your DNS provider:

| Subdomain | Type | Value |
|-----------|------|-------|
| `vhs.devnet.postfiat.org` | A | `<DEVNET_VPS_IP>` |
| `vhs.testnet.postfiat.org` | A | `<TESTNET_VPS_IP>` |

## Step 5: Verify Deployment

Check containers are running:

```bash
docker ps
```

Expected output shows 4 containers: `vhs-postgres`, `vhs-crawler`, `vhs-connections`, `vhs-api`

Test API health:

```bash
curl localhost:3000/v1/health
```

Or from external:

```bash
curl http://vhs.devnet.postfiat.org:3000/v1/health
```

## Monitoring

View logs:

```bash
# All services
docker compose logs -f

# Specific service
docker logs -f vhs-api
docker logs -f vhs-crawler
docker logs -f vhs-connections
```

Check database:

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
| Push to `devnet` | `deploy-devnet.yml` | Tests → Builds image → Pushes to Docker Hub → SSHs to devnet VPS → Pulls new image → Restarts containers |
| Push to `testnet` | `deploy-testnet.yml` | Tests → Builds image → Pushes to Docker Hub → SSHs to testnet VPS → Pulls new image → Restarts containers |

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
