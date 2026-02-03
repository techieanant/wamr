# WAMR Deployment Guide

This guide covers production deployment using Docker and development using Turborepo.

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (for production)

## Quick Start (Development)

For development setup, see the main [README.md](README.md#-quick-start).

For environment variable details, see [ENVIRONMENT.md](ENVIRONMENT.md).

## Production Deployment (Docker)

WAMR uses a single combined container that serves both frontend and backend for simplified deployment.

### Using docker-compose.prod.yml

This is the recommended method for production deployments with data stored in the current directory.

**Quick Start (Using Defaults):**

```bash
# Pull and start with default settings
docker compose -f docker-compose.prod.yml up -d

# Default credentials: admin / wamr123456
# Access: http://localhost:9002
```

⚠️ **For production, you MUST customize the security settings!**

**1. Customize Environment Variables (Recommended for Production)**

Create a `.env.prod` file to override defaults:

```bash
# Copy example file
cp .env.example .env.prod
```

Edit `.env.prod` with your custom values:

```bash
# Host port mapping (default: 9002)
HOST_PORT=9002

# Security - REQUIRED! Change these values for production!
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Optional: Customize paths
DATA_PATH=./data
BAILEYS_PATH=./.baileys_auth

# Optional: Adjust settings (these have sensible defaults)
# NODE_ENV=production
# PORT=9000
# CORS_ORIGIN=*
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100
# LOGIN_RATE_LIMIT_MAX=5
# MEDIA_MONITORING_INTERVAL_MS=300000
# LOG_LEVEL=info
# LOG_PRETTY=false
```

**2. Run the Container**

```bash
# Pull the latest image and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop the container
docker compose -f docker-compose.prod.yml down
```

**3. Access the Application**

- **Local network (HTTP)**: `http://YOUR_SERVER_IP:9002` (or your custom HOST_PORT)
- **Localhost**: `http://localhost:9002`
- **Via reverse proxy (HTTPS)**: `https://wamr.yourdomain.com`

**4. Default Credentials**

- Username: `admin` (customize with `ADMIN_USERNAME`)
- Password: `wamr123456` (customize with `ADMIN_PASSWORD`)
- ⚠️ **Change the password immediately after first login!**

**5. Data Storage**

Data is stored in the current directory (customizable via `.env.prod`):

- `./data/` - SQLite database (customize with `DATA_PATH`)
- `./.baileys_auth/` - WhatsApp session data (customize with `BAILEYS_PATH`)

These folders will be created automatically if they don't exist.

### Environment Variable Reference

The `docker-compose.prod.yml` file uses environment variables with sensible defaults. You can override any of these by creating a `.env.prod` file:

| Variable                       | Default              | Description                         |
| ------------------------------ | -------------------- | ----------------------------------- |
| `HOST_PORT`                    | `9002`               | Host port to expose the application |
| `NODE_ENV`                     | `production`         | Node environment                    |
| `PORT`                         | `9000`               | Container internal port             |
| `DATABASE_PATH`                | `/app/data/wamr.db`  | Database path inside container      |
| `JWT_SECRET`                   | _(default provided)_ | **⚠️ Change for production!**       |
| `ENCRYPTION_KEY`               | _(default provided)_ | **⚠️ Change for production!**       |
| `ADMIN_USERNAME`               | `admin`              | Admin username                      |
| `ADMIN_PASSWORD`               | `wamr123456`         | **⚠️ Change immediately!**          |
| `CORS_ORIGIN`                  | `*`                  | Allowed CORS origins                |
| `WHATSAPP_SESSION_PATH`        | `/app/.baileys_auth` | WhatsApp session path               |
| `RATE_LIMIT_WINDOW_MS`         | `900000`             | Rate limit window (15 min)          |
| `RATE_LIMIT_MAX_REQUESTS`      | `100`                | Max requests per window             |
| `LOGIN_RATE_LIMIT_MAX`         | `5`                  | Max login attempts                  |
| `MEDIA_MONITORING_INTERVAL_MS` | `300000`             | Monitoring interval (5 min)         |
| `LOG_LEVEL`                    | `info`               | Logging level                       |
| `LOG_PRETTY`                   | `false`              | Pretty print logs                   |
| `DATA_PATH`                    | `./data`             | Host path for database              |
| `BAILEYS_PATH`                 | `./.baileys_auth`    | Host path for WhatsApp session      |

### Build from Source

If you want to build the image yourself:

```bash
# Clone the repository
git clone https://github.com/techieanant/wamr.git
cd wamr

# Setup environment
cp .env.example .env.prod
# Edit .env.prod with your settings

# Build and run
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Network Access Configuration

WAMR can work on both local network (HTTP) and reverse proxy (HTTPS) simultaneously:

**For Local Network Access:**

- Set `CORS_ORIGIN=*` in environment variables
- Access via `http://YOUR_SERVER_IP:9002`

**For Reverse Proxy (HTTPS) Access:**

- Set `CORS_ORIGIN=*` or specify your domain: `CORS_ORIGIN=https://wamr.yourdomain.com`
- Configure your reverse proxy (Nginx Proxy Manager, Caddy, Traefik) to forward to port 9002
- The backend has `trust proxy` enabled to handle X-Forwarded-Proto headers

**Both at the same time:**

- Use `CORS_ORIGIN=*` to allow access from any origin
- Access locally via HTTP and remotely via HTTPS reverse proxy

### Alternative Deployment (Using docker-compose.yml)

If you prefer using the legacy method with docker-compose.yml and a single `.env` file:

**1. Setup Environment Variables**

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

**Important**: No need to configure `VITE_API_URL` - the frontend uses relative paths (`/api`) since it's served from the same origin. Configure `CORS_ORIGIN=*` if accessing via reverse proxy or local network.

**2. Build and Run**

```bash
# Build the Docker image
npm run docker:build

# Start the container (uses docker-compose.yml)
npm run docker:up

# View logs
npm run docker:logs

# Stop the container
npm run docker:down
```

**3. Access the Application**

Everything is available on a single port (default 4000, or your configured PORT):

- **Application**: `http://192.168.1.12:9000` (or your configured PORT)
- **API**: `http://192.168.1.12:9000/api`
- **Health Check**: `http://192.168.1.12:9000/health`

**4. Persistent Data**

Docker volumes are automatically created for:

- `wamr-data`: SQLite database
- `wamr-whatsapp-auth`: WhatsApp session data

---

### Benefits of Combined Container

- ✅ Simpler deployment (one container serving everything)
- ✅ Smaller resource footprint
- ✅ Single port to expose
- ✅ Real-time WebSocket updates work seamlessly
- ✅ Faster build times with optimized Dockerfile

## Configuration Reference

📖 For complete environment variable documentation, see [ENVIRONMENT.md](ENVIRONMENT.md).

📖 For development setup and commands, see [README.md](README.md).

**Generate Security Keys:**

```bash
openssl rand -base64 32  # JWT_SECRET
openssl rand -hex 32     # ENCRYPTION_KEY
```

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
docker cp wamr-combined:/app/.baileys_auth ./whatsapp-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Restore database
docker cp ./backup.db wamr-combined:/app/data/wamr.db

# Restore WhatsApp session
docker cp ./whatsapp-backup wamr-combined:/app/.baileys_auth
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
