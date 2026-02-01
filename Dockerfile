# Minimal Combined Build - Fast Version
# Baileys doesn't need Puppeteer/Chromium - it uses WebSockets directly

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

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

# Production stage - Use lightweight Node.js image
FROM node:20-slim

# Create non-root user
RUN groupadd -r wamr && useradd -r -g wamr wamr

WORKDIR /app

# Install only minimal required packages
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
  chown -R wamr:wamr /app

# Set environment
ENV NODE_ENV=production

# Expose single port
EXPOSE 4000

# Create startup script that fixes volume permissions
RUN echo '#!/bin/sh\nset -e\necho "Fixing volume permissions..."\nchown -R wamr:wamr /app/data /app/.wwebjs_auth 2>/dev/null || true\necho "Running database migrations..."\nnode dist/database/migrate.js\necho "Running database seed..."\nnode dist/database/seed.js\necho "Starting server..."\nexec node dist/index.js' > /docker-entrypoint.sh && \
  chmod +x /docker-entrypoint.sh && \
  chown wamr:wamr /docker-entrypoint.sh

# Switch to non-root user for security
USER wamr

# Health check (must be after USER)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["/docker-entrypoint.sh"]
