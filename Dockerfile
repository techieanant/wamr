# Minimal Combined Build - Fast Version
# Uses Puppeteer's pre-built Chromium image to avoid long installation

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install git (required for GitHub package dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Configure git to use HTTPS instead of SSH for GitHub
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && \
  git config --global url."https://github.com/".insteadOf git@github.com:

# Copy all package files
COPY package*.json ./
COPY turbo.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Copy source files
COPY backend/tsconfig.json backend/build.js ./backend/
COPY backend/src ./backend/src
COPY backend/drizzle ./backend/drizzle
COPY backend/drizzle.config.ts ./backend/
COPY backend/scripts ./backend/scripts

COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/components.json ./frontend/
COPY frontend/postcss.config.js frontend/tailwind.config.ts frontend/index.html ./frontend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public

# Install dependencies
RUN npm install && npm cache clean --force

# Build backend
WORKDIR /app/backend
RUN npm run build

# Build frontend with relative API paths
WORKDIR /app/frontend
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm install --no-save @rollup/rollup-linux-x64-gnu
RUN npm run build

# Production stage - Use Puppeteer image with Chromium pre-installed
FROM ghcr.io/puppeteer/puppeteer:23.11.1

# Switch to root to install additional packages
USER root

WORKDIR /app

# Install only minimal required packages (much faster than full chromium install)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY backend/package.json ./

# Install production dependencies
RUN npm install --only=production && npm cache clean --force

# Copy root package.json for version info at runtime (after npm ci to avoid conflicts)
COPY package.json /app/root-package.json

# Copy built backend and frontend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/frontend/dist ./public
COPY backend/drizzle ./drizzle
COPY backend/drizzle.config.ts ./

# Create volume mount points and set proper ownership
RUN mkdir -p /app/.wwebjs_auth /app/data && \
  chown -R pptruser:pptruser /app

# Set environment
# PUPPETEER_EXECUTABLE_PATH points to Chrome from the base Puppeteer image
# This is needed because npm install may bring in a different puppeteer version
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/home/pptruser/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Expose single port
EXPOSE 4000

# Create startup script that fixes volume permissions
RUN echo '#!/bin/sh\nset -e\necho "Fixing volume permissions..."\nsudo chown -R pptruser:pptruser /app/data /app/.wwebjs_auth 2>/dev/null || true\necho "Running database migrations..."\nnode dist/database/migrate.js\necho "Running database seed..."\nnode dist/database/seed.js\necho "Starting server..."\nexec node dist/index.js' > /docker-entrypoint.sh && \
  chmod +x /docker-entrypoint.sh && \
  chown pptruser:pptruser /docker-entrypoint.sh

# Install sudo and configure pptruser to use it without password for chown
RUN apt-get update && apt-get install -y --no-install-recommends sudo && \
  echo "pptruser ALL=(ALL) NOPASSWD: /bin/chown" >> /etc/sudoers && \
  rm -rf /var/lib/apt/lists/*

# Switch to non-root user for security
USER pptruser

# Health check (must be after USER)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["/docker-entrypoint.sh"]
