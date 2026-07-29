# wamr Handoff

## Project Overview

**wamr** — WhatsApp Auto Media Requester. Monorepo (turborepo): React 18 + Vite + Tailwind + Radix + react-query frontend; Node + Express + Drizzle + better-sqlite3 + Baileys (WhatsApp Web API) backend. Deployed as Docker container via CasaOS on `micasa` (10.0.0.197).

- GitHub: `github.com/techieanant/wamr`
- Docker: `ghcr.io/techieanant/wamr:latest`
- Latest version: **v1.6.0** (released 2026-07-19)

---

## Deployed Instance (micasa)

| Property | Value |
|---|---|
| Host | `micasa` (alias: `ssh -p 1616 n0x@10.0.0.197`) |
| Container name | `wamr` |
| Web port | `9002` (maps to container 9000) |
| DB volume | `/DATA/AppData/wamr/data/` → `/app/data/` |
| Auth volume | `/DATA/AppData/wamr/.baileys_auth/` → `/app/.baileys_auth/` |
| CasaOS app dir | `/var/lib/casaos/apps/wamr/docker-compose.yml` |
| Compose backup | `/Users/anant/Workspace/homelab/compose/inventory/micasa/wamr/docker-compose.yml` |
| Container state | ✅ Healthy, running v1.6.0 (CasaOS-managed) |

### CasaOS-specific Notes

- CasaOS tracks containers via `com.docker.compose.project=wamr` + `com.docker.compose.project.working_dir=/var/lib/casaos/apps/wamr` labels.
- Compose files in `/var/lib/casaos/apps/<name>/` are **root 0600** (`n0x` can't read/write directly; `sudo` needs password).
- To modify compose or redeploy, **always use nsenter** (NOT raw `docker run` which strips CasaOS labels):
  ```bash
  # Copy compose into place (as root via alpine container)
  docker run --rm --entrypoint sh \
    -v /var/lib/casaos/apps/wamr:/target \
    -v /tmp/wamr.yml:/src/docker-compose.yml:ro alpine \
    -c 'cp /src/docker-compose.yml /target/docker-compose.yml && chmod 600 /target/docker-compose.yml'

  # Redeploy (stamps correct CasaOS labels)
  docker run --rm --privileged --pid=host alpine \
    nsenter -t 1 -m -u -i -n -p -- \
    docker compose --project-directory /var/lib/casaos/apps/wamr --project-name wamr up -d
  ```
- A complete nsenter procedure is documented in `/Users/anant/.config/opencode/skills/micasa/SKILL.md`.

---

## Key Architecture Details

### Database

- **Engine:** better-sqlite3 (synchronous, single-file)
- **ORM:** Drizzle (used for schema + query building, NOT for migrations at runtime)
- **Migrator:** Custom `backend/src/database/migrate.ts` reads `.sql` files from `backend/drizzle/migrations/` and tracks applied migrations in `__drizzle_migrations` table (using filename as hash key). **Idempotent** — "duplicate column" errors are caught and logged as already-applied, not fatal.
- **Migration files are source of truth** for deployed DBs. Drizzle Kit (`db:migrate` npm script) is ONLY for local dev; runtime uses `db:migrate:run` (`node dist/database/migrate.js`).
- The `_journal.json` file is irrelevant at runtime.
- Schema: `backend/src/db/schema.ts` (defines all tables, columns, enums, relations).
- **Important enums:** `RequestStatus = PENDING | APPROVED | REJECTED | SUBMITTED | FAILED`; `ServiceType = radarr | sonarr | seerr`.

### DB Test Copies

- Prod DB is copied to `/Users/anant/Workspace/wamr/proddb/wamr.db` for local testing.
- `*.db` is gitignored.
- To run local dev server against it:
  ```bash
  ENCRYPTION_KEY=96a4f9ff8eb54b577abf567609167e381b40bb9d2308e574a235bd90c13b5133 \
  DATABASE_PATH=/Users/anant/Workspace/wamr/proddb/wamr.db PORT=4000 npm run dev
  ```
  Then `npm run frontend:dev` (also adjust `VITE_BACKEND_PORT` if not 4000). Login with prod admin credentials.
- **Warning:** Starting the dev server against the prod copy will auto-connect to the real WhatsApp account (Baileys session lives in the DB). This creates a brief dual-connection.

### Requests / Media Service Flow

1. WhatsApp user sends a media title → conversation state machine (`backend/src/services/conversation/`) → search → user confirms.
2. If auto-approve is on → `request-approval.service.ts` `submitToService()` → creates `SUBMITTED` request + sends "✅" WhatsApp.
3. If manual mode → creates `PENDING` request → admin approves via `POST /api/requests/:id/approve` (UI button) → `requests.controller.ts` `approveRequest()` → submits to service → updates to `SUBMITTED`.
4. On submission failure → `FAILED` with `errorMessage` stored.
5. **Media monitoring** (`backend/src/services/media-monitoring/media-monitoring.service.ts`) polls every N seconds for `SUBMITTED` requests, checks the media service for availability, sends "available" WhatsApp to `replyJid` when done.
6. **Retry** (`POST /api/requests/:id/retry`) — new in v1.6.0 — re-submits `FAILED` or `REJECTED` requests using the same submit logic. Success → `SUBMITTED` (monitoring picks it up). Failure → stays `FAILED` with updated error.

### Config / Secrets

- Backend env vars defined in `backend/src/config/environment.ts` (Zod schema).
- **`ENCRYPTION_KEY`** (64 hex chars, AES-256-GCM) — used for encrypting phone numbers, API keys, etc. Prod value:
  ```
  96a4f9ff8eb54b577abf567609167e381b40bb9d2308e574a235bd90c13b5133
  ```
- No separate `SESSION_SECRET` in the schema — only `ENCRYPTION_KEY`.
- `VITE_BACKEND_PORT` + `VITE_PORT` in `.env.local` / `.env.example` — determines frontend proxy.

---

## Completed Work

### v1.5.1 — Broadcast Crash Fix (2026-07-15)
- **Cause:** Migration `0020_add_broadcasts.sql` created `broadcast_recipients` WITHOUT `reply_jid` column, but `backend/src/db/schema.ts:363` defines it and code (`broadcast.repository.ts:127`, `broadcast-scheduler.service.ts`) inserts/selects it. On a DB built purely from migrations (fresh deploy), this threw `SqliteError: no such column` → unhandled promise rejection in scheduler tick → crashed the ENTIRE server (WhatsApp + media monitoring, not just broadcasts).
- **Fix:** Migration `0022_add_reply_jid_to_broadcast_recipients.sql` adds the column. Scheduler tick hardened: `try/catch` around `findResumable()`/`findDue()` in `backend/src/services/broadcast/broadcast-scheduler.service.ts` so errors log instead of killing the process.
- **Live fix:** `ALTER TABLE broadcast_recipients ADD COLUMN reply_jid text` run on prod DB before migration 0022 existed.
- **Commit:** `5b3d27c` | Tag: `v1.5.1`

### v1.6.0 — Manual Retry for Failed/Rejected Requests (2026-07-19)
- **Feature:** Admin can re-submit `FAILED` or `REJECTED` media requests to their service after fixing the issue (e.g. updating Seerr URL).
- `POST /api/requests/:id/retry` — reuses the same submit+notify logic as `approveRequest` (from `requests.controller.ts`).
  - Guard: returns 400 if status is not `FAILED` or `REJECTED`, or if no service config.
  - On success: status → `SUBMITTED`, `errorMessage` cleared, `submittedAt` set. WhatsApp notification sent to original requester ("🔄 Request retried successfully!"). Media monitoring will notify when available.
  - On failure: stays `FAILED`, `errorMessage` updated. If the error indicates "already exists" → sends an "it's already available" message instead of a failure.
- **Frontend:** Retry (↻ RotateCw) icon button in Requests table, visible only for `FAILED`/`REJECTED` rows. Wired through `use-requests` hook → `requests.tsx` page with toast feedback.
- **No new migrations** — uses existing `status`, `errorMessage`, `submittedAt` columns.
- **Tests:** 7 new unit tests (invalid ID, not found, wrong status, no service config, service disabled, successful retry, failed retry keeps FAILED). Total: 728 tests (45 files) passing.
- **Commit:** `dd9f3b5` | Tag: `v1.6.0`
- **Docker Build:** completed successfully → `ghcr.io/techieanant/wamr:latest` = 1.6.0

### CasaOS Instance Restoration
- The container was temporarily running without CasaOS labels (broken by manual `docker run`). Restored via nsenter redeploy using the backup compose.

---

## Releases

| Version | Date | Tag | Description |
|---|---|---|---|
| v1.6.0 | 2026-07-19 | `v1.6.0` | Manual retry for FAILED/REJECTED requests |
| v1.5.1 | 2026-07-15 | `v1.5.1` | Broadcast crash fix (reply_jid + scheduler hardening) |
| v1.5.0 | 2026-07-15 | `v1.5.0` | Broadcast messaging, LID→PN resolution, JSON export |
| v1.4.0 | 2026-07-01 | `v1.4.0` | Relevance search, quota stats, contact cleanup |

CasaOS Docker image tag workflow: `.github/workflows/docker.yml` triggers on `push: tags: ['v*']`. Pushing a tag automatically builds + pushes to `ghcr.io`.

---

## Development Workflow

### Commands
```bash
# Backend
cd backend && npm run dev          # tsx watch (localhost:4000 by default)
npm run build                      # node build.js → dist/
npm run test                       # vitest (all)
npm run typecheck                  # tsc --noEmit
npm run lint                       # eslint

# Frontend
cd frontend && npm run dev         # Vite dev server
npx tsc --noEmit                   # frontend typecheck

# Root
npm run dev                        # turbo dev (both)
npm run build                      # turbo build (both)
npm run format                     # prettier (all)
```

### Tests
- Backend: Vitest (`npm run test`) — 728 tests across 45 files.
- Tests live in `backend/tests/unit/` and `backend/src/**/__tests__/`.
- Pre-commit hook runs lint + format checks.

### Release Process
```bash
# Bump version in all three package.json files
# Commit, push main
git tag vX.Y.Z && git push origin vX.Y.Z
# Docker Build runs automatically on tag push
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file notes.md
```

---

## Debugging Tips

### Common Issues

1. **"no such column" error on startup** — DB is missing a column that the code expects. The custom migrator (`migrate.ts`) is idempotent and wraps `ALTER` errors. If needed, run `ALTER TABLE` manually on the prod DB.

2. **CasaOS doesn't show the app** — Container was created without `com.docker.compose.*` labels (e.g. via raw `docker run`). Fix by redeploying via nsenter (see CasaOS section above).

3. **WhatsApp auto-connects on localhost** — The prod DB copy includes the Baileys session. Either don't start the backend against it (if you don't want WhatsApp active), or accept the dual connection. There's no `WHATSAPP_ENABLED` toggle currently.

4. **Setup page shows instead of login** — Check port mismatch: frontend Vite proxy defaults to `VITE_BACKEND_PORT=4000`. If the backend is on a different port, API calls silently fail and the app falls back to setup page.

5. **ECONNREFUSED to Seerr/Overseerr** — The service URL in `media_service_configurations` is stale. Update via `PUT /api/services/:id` (Services admin UI). Then retry the FAILED requests.

6. **Can't read/write compose file** — `/var/lib/casaos/apps/wamr/docker-compose.yml` is root 0600. Must use docker-based file ops or nsenter.

### Key Logs
- Backend logs are JSON-structured, output to stdout (captured by Docker).
- Filter for `broadcast-scheduler` for scheduler errors.
- Filter for `requestId` to trace a specific request's lifecycle.
- Filter for `level:50` for fatal/unhandled errors (the crash was level 50).

---

## Environment / Ports

| Service | Port |
|---|---|
| Backend (dev default) | 4000 |
| Backend (prod / CasaOS) | 9000 (container) → 9002 (host) |
| Frontend (dev default) | 3000 |
| Vite proxy (default) | 4000 |
| Seerr | 5055 (internal: 10.0.0.128) |
| SSH (micasa) | 1616 |