# Environment Configuration Guide

This document explains how environment variables work in WAMR for different deployment scenarios.

## Overview

WAMR uses different `.env` files for development vs production:

- **Development** (npm run dev): Uses `.env.local` in project root
- **Production** (Docker): Uses `.env.prod` in project root or environment variables in docker-compose files

## Development Mode

When running `npm run dev`, the monorepo starts both frontend and backend development servers using `.env.local`:

### Configuration File

- Location: `.env.local` (project root)
- Loaded by: Both backend and frontend
- Configuration:

  ```bash
  # Environment
  NODE_ENV=development

  # Application Ports
  PORT=4000                   # Backend API server port
  VITE_PORT=3000              # Frontend dev server port

  # Database
  DATABASE_PATH=./backend/data/wamr.db

  # Security (generate secure values!)
  JWT_SECRET=<32+ characters>
  ENCRYPTION_KEY=<64 hex chars>

  # Admin credentials (optional - setup wizard will prompt if not set)
  # ADMIN_USERNAME=admin
  # ADMIN_PASSWORD=changeme123456

  # CORS (frontend URL for development)
  CORS_ORIGIN=http://localhost:3000

  # Rate limiting
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=1000
  LOGIN_RATE_LIMIT_MAX=5

  # Logging
  LOG_LEVEL=debug
  LOG_PRETTY=true

  # WhatsApp
  WHATSAPP_SESSION_PATH=./backend/.baileys_auth

  # Media monitoring interval (ms)
  MEDIA_MONITORING_INTERVAL_MS=300000
  ```

### How It Works

1. Frontend runs on `http://localhost:3000`
2. Backend runs on `http://localhost:4000`
3. Vite dev server proxies `/api` and `/socket.io` requests to backend
4. On first access, complete the setup wizard to create admin account
5. You access the app at `http://localhost:3000`

### Setup Steps

```bash
# 1. Copy example file
cp .env.example .env.local

# 2. Generate secure keys for .env.local
openssl rand -base64 32  # Use for JWT_SECRET
openssl rand -hex 32     # Use for ENCRYPTION_KEY

# 3. Edit .env.local and set the generated values

# 4. Setup database
cd backend
npm run db:migrate

# 5. Start development
cd ..
npm run dev

# 6. Complete setup wizard at http://localhost:3000
```

## Production Mode (Docker)

WAMR provides multiple deployment options:

### Option 1: docker-compose.prod.yml (Recommended)

The `docker-compose.prod.yml` file includes sensible defaults for all environment variables. You can run it immediately without any configuration:

```bash
# Quick start with defaults
docker compose -f docker-compose.prod.yml up -d

# Default credentials: admin / wamr123456
# Access: http://localhost:9002
```

**Customizing with .env.prod (Recommended for Production)**

For production deployments, create a `.env.prod` file to override the defaults:

**Location:** `.env.prod` (project root)

**Key Variables to Customize:**

```bash
# Security - REQUIRED for production!
JWT_SECRET=<generate: openssl rand -base64 32>
ENCRYPTION_KEY=<generate: openssl rand -hex 32>

# Optional: Pre-configure admin (skips setup wizard)
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=<your-secure-password>

# Optional: Customize port
HOST_PORT=9002              # Host port (default: 9002)

# Optional: Customize data paths
DATA_PATH=./data            # Database location (default: ./data)
BAILEYS_PATH=./.baileys_auth  # WhatsApp session (default: ./.baileys_auth)

# Optional: Network & Performance
CORS_ORIGIN=*               # CORS origins (default: *)
RATE_LIMIT_MAX_REQUESTS=100 # Rate limit (default: 100)
LOG_LEVEL=info              # Logging level (default: info)
```

**All Available Variables with Defaults:**

| Variable                       | Default             | Description                              |
| ------------------------------ | ------------------- | ---------------------------------------- |
| `HOST_PORT`                    | `9002`              | Host port to expose                      |
| `NODE_ENV`                     | `production`        | Node environment                         |
| `PORT`                         | `9000`              | Container port                           |
| `DATABASE_PATH`                | `/app/data/wamr.db` | Database path                            |
| `JWT_SECRET`                   | _(provided)_        | JWT signing secret                       |
| `ENCRYPTION_KEY`               | _(provided)_        | Encryption key                           |
| `ADMIN_USERNAME`               | _(optional)_        | Pre-configure admin (skips setup wizard) |
| `ADMIN_PASSWORD`               | _(optional)_        | Pre-configure admin password             |
| `CORS_ORIGIN`                  | `*`                 | CORS origins                             |
| `WHATSAPP_SESSION_PATH`        | `/app/.baileys_auth`| WhatsApp path                            |
| `RATE_LIMIT_WINDOW_MS`         | `900000`            | Rate limit window                        |
| `RATE_LIMIT_MAX_REQUESTS`      | `100`               | Max requests                             |
| `LOGIN_RATE_LIMIT_MAX`         | `5`                 | Max login attempts                       |
| `MEDIA_MONITORING_INTERVAL_MS` | `300000`            | Monitoring interval                      |
| `LOG_LEVEL`                    | `info`              | Logging level                            |
| `LOG_PRETTY`                   | `false`             | Pretty logs                              |
| `DATA_PATH`                    | `./data`            | Host data path                           |
| `BAILEYS_PATH`                 | `./.baileys_auth`   | Host session path                        |

**Setup:**

```bash
# Option A: Use defaults (quick start)
docker compose -f docker-compose.prod.yml up -d

# Option B: With custom .env.prod file
cp .env.example .env.prod
# Edit .env.prod with your values
docker compose -f docker-compose.prod.yml up -d

# Access at http://localhost:9002 or http://YOUR_SERVER_IP:9002
```

### Option 2: Legacy docker-compose.yml

Uses root `.env` file for configuration.

**Configuration:**

- Location: `.env` (root directory)
- Single Port: Everything runs on one port (default 9000)
- Configuration:

  ```bash
  PORT=9000                   # Single port for both frontend + backend

  # Security (REQUIRED! Generate new values!)
  JWT_SECRET=<32+ characters>
  ENCRYPTION_KEY=<64 hex chars>

  # Admin credentials
  ADMIN_USERNAME=admin
  ADMIN_PASSWORD=changeme1234

  # CORS - Allow access from reverse proxy and local network
  CORS_ORIGIN=*

  # Rate limiting
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=100
  LOGIN_RATE_LIMIT_MAX=5

  # Media monitoring interval (ms)
  MEDIA_MONITORING_INTERVAL_MS=300000

  # Logging
  LOG_LEVEL=info
  LOG_PRETTY=false
  ```

**Setup:**

```bash
# Copy and configure
cp .env.example .env

# Build and start
npm run docker:build
npm run docker:up

# Access at http://localhost:9000
```

## Important Environment Variables

### CORS_ORIGIN

Controls which origins can access the API. Important for network access:

- **Development**: `http://localhost:3000` (frontend dev server)
- **Production (any origin)**: `*` (allows local network + reverse proxy)
- **Production (specific domains)**: `https://wamr.yourdomain.com,http://192.168.1.100:9002`

**For simultaneous local and reverse proxy access:**

```bash
CORS_ORIGIN=*
```

This allows:

- Local network access via HTTP: `http://YOUR_SERVER_IP:9002`
- Reverse proxy access via HTTPS: `https://wamr.yourdomain.com`

### Security Keys

**JWT_SECRET**

- Minimum 32 characters
- Used for JWT token signing
- Generate: `openssl rand -base64 32`

**ENCRYPTION_KEY**

- Exactly 64 hex characters (32 bytes)
- Used for AES-256-GCM encryption of API keys
- Generate: `openssl rand -hex 32`

### Admin Credentials

**ADMIN_USERNAME**

- Default: `admin`
- Can be customized to any username

**ADMIN_PASSWORD**

- Minimum 4 characters (12+ recommended for production)
- Set via setup wizard or environment variable
- Change from default values immediately if pre-configured!

## Environment Variable Loading Order

### Backend (backend/src/config/environment.ts)

1. Checks `NODE_ENV` to determine which file to load
2. Development: Loads `.env.local`
3. Production: Loads `.env.prod`
4. Falls back to defaults if variables not set

### Frontend (frontend/vite.config.ts)

1. Loads environment from project root (one directory up)
2. Uses `envDir` configuration pointing to `..`
3. Loads `.env.local` for development
4. Environment variables must be prefixed with `VITE_` to be exposed to frontend

## How It Works

### Development

1. Frontend runs on `http://localhost:3000` (VITE_PORT)
2. Backend runs on `http://localhost:4000` (PORT)
3. Vite dev server proxies `/api` and `/socket.io` requests to backend
4. You access the app at `http://localhost:3000`
5. CORS set to `http://localhost:3000`

### Production (Docker)

1. Backend serves both API and pre-built frontend files
2. Everything accessible on single port (e.g., `http://your-server:9002`)
3. CORS set to `*` for flexible access (local network + reverse proxy)
4. WhatsApp session and SQLite database persist via volumes
5. Backend trusts proxy headers for proper HTTPS handling behind reverse proxy

## Quick Reference

| Scenario              | File                | Frontend Port | Backend Port | Access URL                  | CORS_ORIGIN           |
| --------------------- | ------------------- | ------------- | ------------ | --------------------------- | --------------------- |
| Development           | .env.local          | 3000          | 4000         | http://localhost:3000       | http://localhost:3000 |
| Docker (prod compose) | .env.prod or inline | -             | 9000→9002    | http://localhost:9002       | \*                    |
| Docker (legacy)       | .env (root)         | -             | 9000         | http://localhost:9000       | \* (recommended)      |
| Behind Reverse Proxy  | .env.prod or inline | -             | 9000→9002    | https://wamr.yourdomain.com | \* or specific domain |

## Troubleshooting

### "Development uses wrong port"

- Check `.env.local` has `PORT=4000` and `VITE_PORT=3000`
- Restart dev servers: `npm run dev`

### "Docker uses wrong port"

- For docker-compose.prod.yml: Port mapping is 9002:9000 (host:container)
- For legacy docker-compose.yml: Check root `.env` has `PORT=<desired-port>`
- Rebuild: `npm run docker:down && npm run docker:build && npm run docker:up`

### "Backend can't connect to frontend (CORS error)"

- In development: Check `.env.local` has `CORS_ORIGIN=http://localhost:3000`
- In production: Set `CORS_ORIGIN=*` for flexible access, or specify your domain(s)
- Behind reverse proxy: Use `CORS_ORIGIN=*` or `CORS_ORIGIN=https://yourdomain.com`

### "Can't access via local network (HTTPS/HTTP mismatch)"

- Clear browser HSTS cache (see DEPLOYMENT.md)
- Or access via `http://` not `https://` when connecting directly
- For HTTPS access, set up reverse proxy (Nginx Proxy Manager, Caddy, Traefik)

### "Environment variables not loading"

- Backend: Check `backend/src/config/environment.ts` loads correct .env file based on NODE_ENV
- Frontend: Environment variables must be prefixed with `VITE_` to be exposed
- Restart servers after changing .env files
- For Docker: Rebuild the image after changing environment variables
