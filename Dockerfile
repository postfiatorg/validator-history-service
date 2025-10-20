# Multi-stage Dockerfile for Validator History Service
# Stage 1: Build the application
FROM node:22-alpine AS builder

# Accept build argument for environment (devnet, testnet, or mainnet)
ARG ENVIRONMENT=devnet

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Copy the appropriate .env file based on ENVIRONMENT build arg
RUN if [ -f ".env.${ENVIRONMENT}" ]; then \
      cp ".env.${ENVIRONMENT}" .env; \
      echo "Using .env.${ENVIRONMENT}"; \
    else \
      echo "Warning: .env.${ENVIRONMENT} not found, .env not created"; \
    fi

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine

# Install PostgreSQL client for database operations
RUN apk add --no-cache postgresql-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/bin ./bin

# Copy .env file if it was created in builder stage
COPY --from=builder /app/.env* ./

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose API port (default 3000)
EXPOSE 3000

# Default command (will be overridden by docker-compose)
CMD ["node", "build/index.js", "--api"]
