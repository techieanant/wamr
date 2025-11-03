# WAMR Deployment Guide

This guide covers production deployment using Docker and development using Turborepo.

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (for production)

## Quick Start (Development)

### 1. Install Dependencies

```bash
# Install all dependencies using npm workspaces
npm install
```

### 2. Configure Environment Variables

Backend:

```bash
cd backend
cp .env.example .env
# Edit .env and set your configuration
```

Frontend:

```bash
cd frontend
cp .env.example .env
# Edit .env and set VITE_API_URL
```

### 3. Generate Security Keys

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY
openssl rand -hex 32
```

Add these to your backend `.env` file.

### 4. Run Development Servers

```bash
# Run both backend and frontend with Turbo
npm run dev

# Or run a specific service
npm run backend:dev   # Backend only
npm run frontend:dev  # Frontend only
```

Turbo will handle running both services in parallel with intelligent caching.

## Production Deployment (Docker)

WAMR uses a single combined container that serves both frontend and backend for simplified deployment.

### 1. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:

```bash
# Port for the application (default: 4000)
PORT=9000

# Security - REQUIRED! Change these values!
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORD=your-secure-password

# Optional settings
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOGIN_RATE_LIMIT_MAX=5
MEDIA_MONITORING_INTERVAL_MS=300000
LOG_LEVEL=info
LOG_PRETTY=false
```

**Important**: No need to configure `VITE_API_URL` or `CORS_ORIGIN` - the frontend uses relative paths (`/api`) since it's served from the same origin.

### 2. Build and Run

```bash
# Build the Docker image
npm run docker:build

# Start the container
npm run docker:up

# View logs
npm run docker:logs

# Stop the container
npm run docker:down
```

### 3. Access the Application

Everything is available on a single port (default 4000, or your configured PORT):

- **Application**: `http://192.168.1.12:9000` (or your configured PORT)
- **API**: `http://192.168.1.12:9000/api`
- **Health Check**: `http://192.168.1.12:9000/health`

### 4. Persistent Data

Docker volumes are automatically created for:

- `wamr-data`: SQLite database
- `wamr-whatsapp-auth`: WhatsApp session data

### Benefits of Combined Container

- ✅ Simpler deployment (one container serving everything)
- ✅ No CORS configuration needed (same origin)
- ✅ No URL configuration needed (uses relative paths)
- ✅ Smaller resource footprint
- ✅ Single port to expose
- ✅ Real-time WebSocket updates work seamlessly
- ✅ Faster build times with optimized Dockerfile

## Turborepo Commands

The monorepo uses Turborepo for efficient task orchestration. **Use these commands directly (not `npm run`):**

```bash
# Development
npm run dev              # Run all services in parallel
npm run backend:dev      # Run backend only
npm run frontend:dev     # Run frontend only

# Building
npm run build            # Build all packages
npm run backend:build    # Build backend only
npm run frontend:build   # Build frontend only

# Testing & Quality
npm run test             # Run all tests
npm run lint             # Lint all packages
npm run format           # Format all code
npm run format:check     # Check code formatting

# Cleanup
npm run clean            # Clean all build artifacts and caches
```

### Why Turbo?

Turbo provides significant benefits over running `npm run` in each package:

- **Smart Caching**: Build outputs are cached. If nothing changed, tasks are instant
- **Parallel Execution**: Runs independent tasks simultaneously across workspaces
- **Dependency Awareness**: Understands workspace dependencies and runs tasks in the right order
- **Incremental Builds**: Only rebuilds what changed
- **Task Pipeline**: Defines task relationships (e.g., test depends on build)

Example: Running `npm run build` will:

1. Build backend (has no dependencies)
2. Build frontend in parallel (if no shared dependencies)
3. Use cached results if source code hasn't changed

### Turbo vs Individual Commands

❌ **Don't do this:**

```bash
cd backend && npm run dev
cd frontend && npm run dev  # In another terminal
```

✅ **Do this:**

```bash
npm run dev  # Runs both with one command
```

The difference: Turbo manages both processes, handles logs better, and provides intelligent caching.

## Environment Variables

### Required

- `JWT_SECRET` - JWT signing secret (generate with: `openssl rand -base64 32`)
- `ENCRYPTION_KEY` - 64 hex character encryption key (generate with: `openssl rand -hex 32`)
- `ADMIN_PASSWORD` - Admin user password (change from default!)

### Optional

- `PORT` - Application port (default: 4000)
- `ADMIN_USERNAME` - Admin username (default: admin)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `LOG_PRETTY` - Pretty print logs in dev (default: true, set false for production)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in milliseconds (default: 900000 = 15 min)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)
- `LOGIN_RATE_LIMIT_MAX` - Max login attempts per window (default: 5)
- `MEDIA_MONITORING_INTERVAL_MS` - Interval to check for completed media requests (default: 300000 = 5 min)

## Health Checks

The application exposes a health check endpoint:

- Health: `GET /health`

Docker Compose automatically monitors this endpoint every 30 seconds.

## Backup and Restore

### Backup

Export data via the Settings page in the UI, or:

```bash
# Copy database
docker cp wamr-combined:/app/data/wamr.db ./backup-$(date +%Y%m%d).db

# Copy WhatsApp session
docker cp wamr-combined:/app/.wwebjs_auth ./whatsapp-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Restore database
docker cp ./backup.db wamr-combined:/app/data/wamr.db

# Restore WhatsApp session
docker cp ./whatsapp-backup wamr-combined:/app/.wwebjs_auth
docker-compose restart
```

## Troubleshooting

### Port Conflicts

If the default port is in use:

```bash
# Edit .env
PORT=8080  # Change to any available port
```

Then rebuild and restart:

```bash
npm run docker:down
npm run docker:build
npm run docker:up
```

### Database Issues

Reset database:

```bash
docker-compose down
docker volume rm wamr_wamr-data
docker-compose up -d
```

### WhatsApp Connection Issues

Reset WhatsApp session:

```bash
docker-compose down
docker volume rm wamr_wamr-whatsapp-auth
docker-compose up -d
# Scan new QR code
```

### View Logs

```bash
# View container logs
npm run docker:logs

# Or use docker directly
docker logs -f wamr-combined
```

## Security Checklist

Before deploying to production:

- [ ] Generate and set `JWT_SECRET` (use: `openssl rand -base64 32`)
- [ ] Generate and set `ENCRYPTION_KEY` (use: `openssl rand -hex 32`)
- [ ] Set strong `ADMIN_PASSWORD` (change from default!)
- [ ] Enable HTTPS (use reverse proxy like nginx/Caddy/Traefik)
- [ ] Set `LOG_PRETTY=false` for production
- [ ] Review and adjust rate limits for your use case
- [ ] Configure firewall rules (only expose necessary ports)
- [ ] Set up automated database backups
- [ ] Keep Docker images updated regularly
- [ ] Monitor container resources (CPU, memory, disk)

## Production Recommendations

1. **Reverse Proxy**: Use nginx or Caddy for:

   - HTTPS/SSL termination
   - Domain routing
   - Load balancing (if scaling)

2. **Monitoring**: Set up monitoring for:

   - Container health
   - Resource usage (CPU, memory)
   - API response times
   - Error rates

3. **Backups**: Automate database backups:

   ```bash
   # Cron job example (daily at 2 AM)
   0 2 * * * docker exec wamr-combined sqlite3 /app/data/wamr.db ".backup '/app/data/backup-$(date +\%Y\%m\%d).db'"
   ```

4. **Updates**: Keep dependencies updated:
   ```bash
   npm audit
   docker-compose pull
   docker-compose up -d --build
   ```

## Support

For issues and questions:

- Check logs: `docker-compose logs -f`
- Review environment variables
- Ensure all required secrets are set
- Verify Docker network connectivity
