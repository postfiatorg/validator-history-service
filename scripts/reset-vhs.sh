#!/bin/bash
set -e

echo "Resetting VHS..."

cd /opt/vhs

echo "Stopping services..."
docker compose down

echo "Removing database volume..."
docker volume rm vhs_postgres_data 2>/dev/null || true

echo "Pulling latest images..."
docker compose pull

echo "Starting services..."
docker compose up -d

echo "Waiting for services to be ready..."
sleep 10

echo "Checking health..."
for i in {1..30}; do
    if curl -s localhost:3000/v1/health > /dev/null 2>&1; then
        echo "VHS is healthy!"
        docker ps --format "table {{.Names}}\t{{.Status}}"
        exit 0
    fi
    echo "Waiting for API... ($i/30)"
    sleep 2
done

echo "Warning: Health check timed out, but services may still be starting"
docker ps --format "table {{.Names}}\t{{.Status}}"
exit 1
