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
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Exit this server and continue with Step 3"
echo "in docs/DEPLOYMENT.md to copy the docker-compose"
echo "file and start the services."
echo ""
echo "Or see: https://github.com/postfiatorg/validator-history-service/blob/main/docs/DEPLOYMENT.md"
