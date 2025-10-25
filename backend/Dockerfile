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

# Install Chromium and dependencies for whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    ca-certificates \
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
    chown -R node:node /app/.wwebjs_auth /app/data

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
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
