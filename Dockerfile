FROM node:25-slim

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
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data mount point
RUN mkdir -p /data/knowledge-base

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
