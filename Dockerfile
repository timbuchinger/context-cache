FROM node:25.7.0-slim

WORKDIR /app

# Copy package files and install all dependencies (including dev for TS build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/indexer-entrypoint.sh
RUN chmod +x /usr/local/bin/indexer-entrypoint.sh

# Create data mount point
RUN mkdir -p /data/knowledge-base

# CMD ["node", "/app/dist/indexer-cli.js"]
