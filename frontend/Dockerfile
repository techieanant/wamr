# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Build argument for API URL
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Install dependencies (using npm install since this is a workspace without its own package-lock.json)
RUN npm install && npm cache clean --force

# Copy source code
COPY src ./src
COPY public ./public
COPY index.html ./
COPY components.json ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./

# Build application
RUN npm run build

# Production stage
FROM nginx:1.29-alpine

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose frontend port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
