# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY build.js ./

# Install ALL dependencies (for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Build with esbuild - handles ES modules correctly
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install Chromium and minimal required dependencies for whatsapp-web.js
# Based on: https://github.com/pedroslopez/whatsapp-web.js/issues/2542
RUN apt-get update && apt-get install -y \
    chromium \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations and config
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

# Create volume mount points with proper permissions
RUN mkdir -p /app/.wwebjs_auth /app/data && \
    chmod -R 755 /app/.wwebjs_auth /app/data

# Set environment
ENV NODE_ENV=production

# Expose backend port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run as root to avoid volume permission issues
# In production, consider using proper user permissions with an init script

# Create startup script that runs migrations and seeds before starting server
RUN echo '#!/bin/sh\nset -e\necho "Running database migrations..."\nnode dist/database/migrate.js\necho "Running database seed..."\nnode dist/database/seed.js\necho "Starting server..."\nexec node dist/index.js' > /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
