# Environment Configuration Guide

This document explains how environment variables work in WAMR for different deployment scenarios.

## Overview

WAMR uses different `.env` files for development vs production:

- **Development** (npm run dev): Uses `backend/.env` and `frontend/.env`
- **Production** (Docker): Uses root `.env`

## Development Mode

When running `npm run dev`, the monorepo starts both frontend and backend development servers:

### Frontend (Port 3000)

- Location: `frontend/.env`
- Configuration:
  ```bash
  VITE_PORT=3000              # Frontend dev server port
  VITE_BACKEND_PORT=4000      # Backend API port for Vite proxy
  VITE_APP_NAME=WAMR
  VITE_APP_VERSION=1.0.0
  ```

### Backend (Port 4000)

- Location: `backend/.env`
- Configuration:

  ```bash
  NODE_ENV=development
  PORT=4000                   # Backend API server port
  DATABASE_PATH=./data/wamr.db

  # Security (generate secure values!)
  JWT_SECRET=<32+ characters>
  ENCRYPTION_KEY=<64 hex chars>

  # Admin credentials
  ADMIN_USERNAME=admin
  ADMIN_PASSWORD=changeme123456

  # CORS (frontend URL)
  CORS_ORIGIN=http://localhost:3000

  # Rate limiting
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=1000

  # Logging
  LOG_LEVEL=debug

  # WhatsApp
  WHATSAPP_SESSION_PATH=./.wwebjs_auth

  # Media monitoring interval (ms)
  MEDIA_MONITORING_INTERVAL_MS=300000
  ```

### How It Works

1. Frontend runs on `http://localhost:3000`
2. Backend runs on `http://localhost:4000`
3. Vite dev server proxies `/api` and `/socket.io` requests to backend
4. You access the app at `http://localhost:3000`

### Setup Steps

```bash
# 1. Copy example files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Generate secure keys for backend/.env
openssl rand -base64 32  # Use for JWT_SECRET
openssl rand -hex 32     # Use for ENCRYPTION_KEY

# 3. Edit backend/.env and set the generated values

# 4. Setup database
cd backend
npm run db:migrate
npm run db:seed

# 5. Start development
cd ..
npm run dev
```

## Production Mode (Docker)

When running with Docker (`npm run docker:up`), the application uses a single combined container:

### Configuration

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

### How It Works

1. Backend serves both API and pre-built frontend files
2. Everything accessible on single port (e.g., `http://your-server:9000`)
3. No CORS needed (same origin)
4. WhatsApp session and SQLite database persist via Docker volumes

### Setup Steps

```bash
# 1. Copy example file
cp .env.example .env

# 2. Generate secure keys
openssl rand -base64 32  # Use for JWT_SECRET
openssl rand -hex 32     # Use for ENCRYPTION_KEY

# 3. Edit .env and set:
#    - PORT (default 9000)
#    - Generated JWT_SECRET
#    - Generated ENCRYPTION_KEY
#    - Secure ADMIN_PASSWORD

# 4. Build and start
npm run docker:build
npm run docker:up

# 5. Access at http://localhost:9000 (or your configured PORT)
```

## Environment Variable Loading Order

### Backend (backend/src/config/environment.ts)

1. Loads `backend/.env` first (development priority)
2. Loads root `.env` as fallback (production)
3. Variables in `backend/.env` override root `.env`

This ensures:

- Development uses `backend/.env` → PORT=4000
- Docker/production uses root `.env` → PORT=9000

### Frontend (frontend/vite.config.ts)

1. Loads `frontend/.env`
2. Vite automatically loads `.env` files based on mode
3. Uses `VITE_PORT` and `VITE_BACKEND_PORT` for dev server configuration

## Quick Reference

| Scenario    | File                        | Frontend Port | Backend Port | Access URL            |
| ----------- | --------------------------- | ------------- | ------------ | --------------------- |
| Development | backend/.env, frontend/.env | 3000          | 4000         | http://localhost:3000 |
| Docker      | .env (root)                 | -             | 9000         | http://localhost:9000 |

## Troubleshooting

### "Development uses wrong port"

- Check `backend/.env` has `PORT=4000`
- Check `frontend/.env` has `VITE_PORT=3000` and `VITE_BACKEND_PORT=4000`
- Restart dev servers: `npm run dev`

### "Docker uses wrong port"

- Check root `.env` has `PORT=<desired-port>`
- Rebuild: `npm run docker:down && npm run docker:build && npm run docker:up`

### "Backend can't connect to frontend (CORS error)"

- In development: Check `backend/.env` has `CORS_ORIGIN=http://localhost:3000`
- In Docker: Not needed (same origin)

### "Environment variables not loading"

- Backend: Check `backend/src/config/environment.ts` loads correct .env
- Frontend: Vite only loads variables prefixed with `VITE_`
- Restart servers after changing .env files
