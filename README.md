# WAMR - WhatsApp Media Request

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of-conduct-ff69b4.svg)](CODE_OF_CONDUCT.md)

An open-source, self-hosted WhatsApp bot that enables users to request movies and TV shows through natural conversation. Automatically submits requests to Radarr, Sonarr, or Overseerr.

> **📋 Documentation:**
>
> - [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment with Docker
> - [ENVIRONMENT.md](ENVIRONMENT.md) - Environment variable configuration guide
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

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local and set secure values:
# - Generate JWT_SECRET: openssl rand -base64 32
# - Generate ENCRYPTION_KEY: openssl rand -hex 32
# - Set ADMIN_USERNAME and ADMIN_PASSWORD

# 3. Setup database
cd backend
npm run db:migrate   # Apply migrations
npm run db:seed      # Create admin user

# 4. Start development (both backend + frontend)
cd ..
npm run dev
```

**Development Environment:**

- Frontend runs on `http://localhost:3000` (configurable via `.env.local` → `VITE_PORT`)
- Backend runs on `http://localhost:4000` (configurable via `.env.local` → `PORT`)
- Vite dev server automatically proxies `/api` and `/socket.io` to backend

**Default Admin Credentials (Development):**

- Username: `admin` (from `.env.local` → `ADMIN_USERNAME`)
- Password: `changeme123456` (from `.env.local` → `ADMIN_PASSWORD`)
- ⚠️ **Change password immediately after first login!**

> **Note:** Use `.env.local` for development and `.env.prod` for Docker/production. See [ENVIRONMENT.md](ENVIRONMENT.md) for details.

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

## 🎯 Use Cases

- **Home Media Server**: Manage family media requests
- **Private Media Libraries**: Controlled access to media automation
- **Community Media Sharing**: Moderate media requests from community members
- **Personal Assistant**: Natural language interface to media services

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

> **💡 Tip:** For detailed Docker deployment options, see [DEPLOYMENT.md](DEPLOYMENT.md)

### Cleanup

```bash
npm run clean            # Remove dist/, node_modules, .turbo cache
```

## 🔐 Security

See [SECURITY.md](SECURITY.md) for our security policy and vulnerability reporting.

**Key Security Features:**

- Encrypted API keys (AES-256-GCM)
- Hashed passwords (bcrypt)
- Hashed phone numbers (SHA-256)
- JWT authentication
- Rate limiting on all endpoints
- Automatic sensitive data redaction in logs

## 📝 Database

### Schema

- **admin_users**: Admin credentials
- **whatsapp_connections**: WhatsApp connection status
- **conversation_sessions**: Active multi-turn conversations
- **media_service_configurations**: Radarr/Sonarr/Overseerr configs
- **request_history**: Audit log of all requests

### Migrations

See [Database Commands](#database-run-from-backend) above for migration workflow.

## 🧪 Testing

**Status**: TODO - Test infrastructure planned

**Planned Coverage:**

- Backend: Unit tests, integration tests, API tests
- Frontend: Component tests, E2E tests
- Target: 80% code coverage

## 🐳 Docker Deployment

**Quick Start:**

```bash
# Pull and start with defaults
docker compose -f docker-compose.prod.yml up -d

# Access: http://localhost:9002
# Login: admin / wamr123456
```

⚠️ **For production**: Create a `.env.prod` file to customize credentials and security keys!

**Customize Settings (Optional):**

```bash
# Create .env.prod file
cp .env.example .env.prod

# Edit with your values (especially JWT_SECRET, ENCRYPTION_KEY, ADMIN_PASSWORD)
# Then start the container
docker compose -f docker-compose.prod.yml up -d
```

**Access:**

- Local: `http://localhost:9002`
- Network: `http://YOUR_SERVER_IP:9002`
- Reverse Proxy: `https://wamr.yourdomain.com`

📖 **See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment instructions, configuration options, and troubleshooting.**

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
