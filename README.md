# WAMR - WhatsApp Media Request

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of-conduct-ff69b4.svg)](CODE_OF_CONDUCT.md)

An open-source, self-hosted WhatsApp bot that enables users to request movies and TV shows through natural conversation. Automatically submits requests to Radarr, Sonarr, or Overseerr.

> **📋 Documentation:**
>
> - [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment with Docker
> - [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
> - [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Community guidelines
> - [SECURITY.md](SECURITY.md) - Security policy and reporting

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (for production deployment)

### Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure backend environment
cd backend
cp .env.example .env
# Edit .env and set secure values (see Backend Configuration below)

# 3. Configure frontend environment
cd ../frontend
cp .env.example .env
# Edit .env to set VITE_API_URL=http://localhost:4000

# 4. Setup database
cd ../backend
npm run db:generate  # Generate migrations
npm run db:migrate   # Apply migrations
npm run db:seed      # Create admin user

# 5. Start development (both backend + frontend)
cd ..
npm run dev
```

**Default Admin Credentials (Development):**

- Username: `admin@wamr.local`
- Password: `changeme123456`
- ⚠️ **Change password immediately after first login!**

> **Note for Docker users:** When running with Docker, credentials come from your `.env` file. See [Docker Deployment](#-docker-deployment) section below.

## 🎯 Features

### Current Features (v1.0)

- 🔐 **Secure Admin Dashboard** - Web-based admin interface with JWT authentication
- 💬 **WhatsApp Integration** - Connect your WhatsApp account via QR code
- 🎬 **Media Request System** - Users can request movies and TV shows via WhatsApp
- 🔄 **Service Integration** - Connect to Radarr, Sonarr, or Overseerr
- 📊 **Request Management** - Approve, reject, or auto-approve media requests
- 🔍 **Media Search** - Search across configured media services
- 📝 **Audit Logging** - Complete history of all requests and actions
- 🔒 **Security First** - Encrypted API keys, hashed credentials, rate limiting
- 🐳 **Docker Ready** - Easy deployment with Docker Compose
- 🎨 **Modern UI** - Beautiful, responsive admin dashboard with Shadcn UI

### Planned Features

- 📺 Multi-user support with request limits
- 🌐 Internationalization (i18n)
- 📊 Analytics and reporting
- 🔔 Notification system
- 🎭 Custom media filtering rules

## 🎯 Use Cases

- **Home Media Server**: Manage family media requests
- **Private Media Libraries**: Controlled access to media automation
- **Community Media Sharing**: Moderate media requests from community members
- **Personal Assistant**: Natural language interface to media services

### Backend Configuration

Generate secure keys for your `.env` file:

```bash
# Generate JWT secret (64 hex characters)
openssl rand -hex 32

# Generate encryption key (64 hex characters)
openssl rand -hex 32
```

Required environment variables:

- `JWT_SECRET` - JWT signing secret (minimum 32 characters)
- `ENCRYPTION_KEY` - AES-256-GCM encryption key (64 hex characters)
- `PORT` - Server port (default: 4000)
- `CORS_ORIGIN` - Frontend URL (default: http://localhost:3000)

## 📂 Project Structure

```
wamr/
├── backend/                # Node.js/Express API
│   ├── src/
│   │   ├── api/           # Routes, controllers, middleware, validators
│   │   ├── config/        # Environment, logger
│   │   ├── db/            # Database client, schema
│   │   ├── services/      # Business logic (auth, encryption, integrations, WhatsApp)
│   │   ├── utils/         # Error codes, templates, helpers
│   │   ├── types/         # TypeScript types
│   │   └── index.ts       # App entry point
│   ├── tests/             # Unit, integration, E2E tests
│   ├── drizzle/           # Database migrations
│   └── data/              # SQLite database file
│
└── frontend/              # React/Vite SPA
    ├── src/
    │   ├── components/    # UI components (shadcn/ui)
    │   ├── pages/         # Page components
    │   ├── hooks/         # Custom React hooks
    │   ├── services/      # API client, Socket.IO
    │   ├── lib/           # Utils, query client
    │   └── types/         # TypeScript types
    └── tests/             # Component and E2E tests
```

## 🛠️ Development Commands

All commands use Turborepo for efficient task orchestration. Run from the project root:

### Development

```bash
npm run dev              # Start both backend + frontend (parallel)
npm run backend:dev      # Backend only
npm run frontend:dev     # Frontend only
```

### Building

```bash
npm run build            # Build everything (with smart caching)
npm run backend:build    # Build backend only
npm run frontend:build   # Build frontend only
```

### Testing & Quality - TODO

```bash
npm run test             # Run all tests
npm run lint             # Lint code
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without changes
```

### Database (run from backend/)

```bash
cd backend
npm run db:generate      # Generate migrations from schema changes
npm run db:migrate       # Apply migrations to database
npm run db:studio        # Open Drizzle Studio (database GUI)
npm run db:seed          # Seed database with admin user
```

### Docker (Production)

```bash
npm run docker:build     # Build Docker images
npm run docker:up        # Start containers in detached mode
npm run docker:down      # Stop and remove containers
npm run docker:logs      # View container logs
npm run docker:restart   # Restart all services
```

### Cleanup

```bash
npm run clean            # Remove dist/, node_modules, .turbo cache
```

### Why Turborepo?

Turborepo provides intelligent caching and parallel execution:

- **Smart Caching**: Build outputs are cached. If nothing changed, tasks are instant
- **Parallel Execution**: Runs independent tasks simultaneously across workspaces
- **Dependency Awareness**: Understands workspace dependencies and runs tasks in the right order
- **Incremental Builds**: Only rebuilds what changed

Example: Running `npm run build` will:

1. Build backend (has no dependencies)
2. Build frontend in parallel (if no shared dependencies)
3. Use cached results if source code hasn't changed

## 🔐 Security

### Environment Variables

Never commit `.env` files to version control. Required secrets:

- `JWT_SECRET`: Minimum 32 characters, used for JWT token signing
- `ENCRYPTION_KEY`: 64 hex characters (32 bytes), used for AES-256-GCM encryption

### Sensitive Data Handling

- Phone numbers are SHA-256 hashed before storage
- API keys are encrypted with AES-256-GCM
- Passwords are bcrypt hashed (cost factor 10)
- Logs automatically redact sensitive fields

### Rate Limiting

- Admin API: 100 requests per 15 minutes
- Login: 5 attempts per 15 minutes
- WhatsApp messages: 10 per minute per phone number

## 📝 Database

### Schema

- **admin_users**: Admin credentials
- **whatsapp_connections**: WhatsApp connection status
- **conversation_sessions**: Active multi-turn conversations
- **media_service_configurations**: Radarr/Sonarr/Overseerr configs
- **request_history**: Audit log of all requests

### Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### SQLite to PostgreSQL Migration

The schema is PostgreSQL-compatible. To migrate:

1. Update `drizzle.config.ts`:

```ts
export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

2. Update `src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

3. Regenerate migrations and apply.

## 🧪 Testing - TODO

### Backend

- **Unit tests**: Service logic, utilities
- **Integration tests**: API endpoints, database operations
- **Coverage target**: 80% minimum

### Frontend

- **Component tests**: React Testing Library + Vitest
- **E2E tests**: Playwright for critical user flows

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT.md) - Production deployment with Docker

## 🐳 Docker Deployment

### Quick Start with Docker

```bash
# 1. Copy and configure environment variables
cp .env.example .env
# Edit .env and set all required values (see below)

# 2. Build and start all services
docker compose up -d

# 3. View logs to get admin credentials
docker compose logs backend | grep "Default admin credentials" -A 3

# 4. Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
```

### Docker Login Credentials

Your admin login credentials are configured in your `.env` file via:

```bash
ADMIN_USERNAME=admin@wamr.local    # Your admin username
ADMIN_PASSWORD=changeme123456      # Your admin password
```

**Important:**

- The credentials displayed in the Docker logs during startup are the ones you should use
- See [DOCKER_LOGIN_GUIDE.md](DOCKER_LOGIN_GUIDE.md) for detailed troubleshooting
- ⚠️ **Change the password immediately after first login!**

### Docker Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild after code changes
docker compose down
docker compose build
docker compose up -d
```

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## 🤝 Contributing

We love contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit using conventional commits (`git commit -m 'feat: add amazing feature'`)
5. Push to your branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Check out [good first issues](https://github.com/techieanant/wamr/labels/good%20first%20issue) to get started!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

This means you are free to use, modify, and distribute this software, even for commercial purposes, as long as you include the original copyright notice and license.

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Radarr](https://radarr.video/) - Movie management
- [Sonarr](https://sonarr.tv/) - TV series management
- [Overseerr](https://overseerr.dev/) - Request management system
- [Shadcn UI](https://ui.shadcn.com/) - Beautiful UI components

## � Support

- 📖 [Documentation](README.md)
- 🐛 [Issue Tracker](https://github.com/techieanant/wamr/issues)
- 💬 [Discussions](https://github.com/techieanant/wamr/discussions)
- 🔒 [Security Policy](SECURITY.md)

## 🗺️ Roadmap

See our [GitHub Projects](https://github.com/techieanant/wamr/projects) for upcoming features and releases.

## ⭐ Star History

If you find this project useful, please consider giving it a star! It helps others discover the project.

---

**Made with ❤️ by Anant**
