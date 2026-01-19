#!/bin/bash
set -e

echo "Setting up VHS server..."

# Update system
apt update && apt upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    apt install -y docker-compose-plugin
fi

# Create VHS directory
mkdir -p /opt/vhs
echo "Created /opt/vhs directory"

# Configure firewall
if command -v ufw &> /dev/null; then
    echo "Configuring firewall..."
    ufw allow 22/tcp
    ufw allow 3000/tcp
    ufw --force enable
    ufw status
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy docker-compose.yml to /opt/vhs/"
echo "2. cd /opt/vhs && docker compose up -d"
echo "3. Verify with: curl localhost:3000/v1/health"
