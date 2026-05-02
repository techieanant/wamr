# Implementation Plan: Jellyseerr Support (P1-A)
Date: 2026-05-02

## Goal
Add `jellyseerr` as a supported service type alongside `overseerr`. Jellyseerr's API is 99% compatible with Overseerr v1, so the implementation is mostly plumbing and labeling.

## Steps

### 1. DB Schema Migration
**File:** `backend/src/db/schema.ts`
- Add `'jellyseerr'` to the `serviceType` enum in `mediaServiceConfigurations` table
- Add `'jellyseerr'` to the `serviceType` enum in `requestHistory` table

**File:** `backend/drizzle/` — generate a new migration:
```bash
cd backend && npm run db:generate
```

### 2. Backend — Service Client
**File:** `backend/src/services/integrations/overseerr.client.ts`
- The `OverseerrClient` class works as-is for Jellyseerr (same API)
- Add a type alias / factory: `export const JellyseerrClient = OverseerrClient`
- OR: export a single `SeerrClient` that accepts `serviceType: 'overseerr' | 'jellyseerr'` (cosmetic only)

### 3. Backend — Media Search Service
**File:** `backend/src/services/integrations/media-search.service.ts`
- Wherever `serviceType === 'overseerr'` is checked, add `|| serviceType === 'jellyseerr'`
- Both use the same client class

### 4. Backend — Request Approval Service
**File:** `backend/src/services/conversation/request-approval.service.ts`
- Same pattern: wherever `overseerr` is checked, also handle `jellyseerr`
- When instantiating the client for a `jellyseerr` config, use `OverseerrClient` (or `SeerrClient`)

### 5. Backend — Integration Test
**File:** `backend/src/services/integrations/__tests__/` or wherever integration tests live
- Add a test case for `jellyseerr` serviceType config, verifying search and request paths work

### 6. Frontend — Service Config Form
**File:** `frontend/src/` — find the media service configuration form/component
- Add `jellyseerr` as an option in the service type dropdown
- Label it "Jellyseerr"
- Use same fields as Overseerr (base URL, API key) — no extra fields needed
- Display name in requests list as "Jellyseerr"

### 7. Documentation
- Update README.md: add Jellyseerr to the "Service Integration" feature bullet and the supported services list
- Update ENVIRONMENT.md if there are any Jellyseerr-specific notes
- Update SCREENSHOTS.md if screenshots show the service type dropdown

## Acceptance Criteria
- [ ] Can add a Jellyseerr service config in admin dashboard
- [ ] Connection test works for a Jellyseerr instance
- [ ] Search returns results when Jellyseerr is the active service
- [ ] Movie and TV requests are submitted successfully via Jellyseerr
- [ ] `request_history` records show `serviceType = 'jellyseerr'`
- [ ] All existing Overseerr tests still pass
- [ ] New tests for Jellyseerr code paths pass
