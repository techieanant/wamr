# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Coming Soon

- Multi-user support with request limits
- Internationalization (i18n)
- Analytics and reporting dashboard
- Enhanced notification system

## [1.0.0] - 2025-10-28

### Added

- Initial public release
- Secure admin dashboard with JWT authentication
- WhatsApp integration using whatsapp-web.js
- Support for Radarr, Sonarr, and Overseerr integration
- Media request system via WhatsApp
- Request approval/rejection workflow
- Auto-approval mode for trusted users
- Comprehensive request history and audit logging
- AES-256-GCM encryption for API keys
- bcrypt password hashing
- SHA-256 phone number hashing
- Rate limiting for API endpoints
- Input validation with Zod schemas
- Docker and Docker Compose configuration
- Monorepo structure with Turborepo
- Modern React frontend with Shadcn UI
- Real-time updates via Socket.IO
- Comprehensive test suite (Vitest + Playwright)
- ESLint and Prettier configuration
- Development documentation
- Deployment guide

### Security

- Environment variable validation
- Automatic log redaction of sensitive data
- CORS protection
- Security headers via Helmet
- SQL injection protection via Drizzle ORM

## Release Notes

### v1.0.0 - Initial Release

This is the first public release of WAMR (WhatsApp Media Request Manager). The project provides a complete, self-hosted solution for managing media requests via WhatsApp.

**Key Features:**

- Complete WhatsApp bot integration
- Web-based admin dashboard
- Multi-service support (Radarr, Sonarr, Overseerr)
- Secure by default with encryption and authentication
- Easy deployment with Docker
- Active development and community support

**Getting Started:**
See the [README.md](README.md) for installation instructions and [DEPLOYMENT.md](DEPLOYMENT.md) for deployment options.

**Contributing:**
We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide.

**Support:**
For bugs and feature requests, please use our [GitHub Issues](https://github.com/techieanant/wamr/issues).

---

[Unreleased]: https://github.com/techieanant/wamr/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/techieanant/wamr/releases/tag/v1.0.0
