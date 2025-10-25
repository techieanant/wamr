# WAMR Deployment Guide

This guide covers production deployment using Docker Compose and development using Turborepo.

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

### 1. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:

- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`
- `ADMIN_PASSWORD` - Set a secure password
- `CORS_ORIGIN` - Set to your frontend URL
- `VITE_API_URL` - Set to your backend URL

### 2. Build and Run with Docker Compose

```bash
# Build images
npm run docker:build

# Start services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### 3. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Health Check: http://localhost:4000/health

### 4. Persistent Data

Docker volumes are used for:

- `wamr-data`: SQLite database
- `wamr-whatsapp-auth`: WhatsApp session data

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

### Backend

Required:

- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `ENCRYPTION_KEY` - 64 hex character encryption key
- `ADMIN_PASSWORD` - Admin user password

Optional:

- `PORT` - Server port (default: 4000)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)
- `LOG_LEVEL` - Logging level (default: info)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)

### Frontend

- `VITE_API_URL` - Backend API URL (default: http://localhost:4000)

## Health Checks

Both services expose health check endpoints:

- Backend: `GET /health`
- Frontend: `GET /health` (nginx)

Docker Compose automatically monitors these endpoints.

## Backup and Restore

### Backup

Export data via the Settings page in the UI, or:

```bash
# Copy database
docker cp wamr-backend:/app/data/wamr.db ./backup-$(date +%Y%m%d).db

# Copy WhatsApp session
docker cp wamr-backend:/app/.wwebjs_auth ./whatsapp-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Restore database
docker cp ./backup.db wamr-backend:/app/data/wamr.db

# Restore WhatsApp session
docker cp ./whatsapp-backup wamr-backend:/app/.wwebjs_auth
docker-compose restart backend
```

## Troubleshooting

### Port Conflicts

If ports 3000 or 4000 are in use:

```bash
# Edit .env
FRONTEND_PORT=8080
BACKEND_PORT=8000
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
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Security Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` from example value
- [ ] Change `ENCRYPTION_KEY` from example value
- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Configure `CORS_ORIGIN` to match your domain
- [ ] Enable HTTPS (use reverse proxy like nginx/Caddy)
- [ ] Set `LOG_PRETTY=false` for production
- [ ] Review and adjust rate limits
- [ ] Configure firewall rules
- [ ] Regular database backups
- [ ] Keep Docker images updated

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
   0 2 * * * docker exec wamr-backend sqlite3 /app/data/wamr.db ".backup '/app/data/backup-$(date +\%Y\%m\%d).db'"
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
