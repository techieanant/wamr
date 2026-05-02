# WAMR Feature Backlog — All Planned Improvements
Generated: 2026-05-02
Source: Reddit user feedback across r/sonarr, r/radarr, r/selfhosted threads

---

## Priority 1 — Stability & Accessibility (Blocking Users)

### [P1-A] Jellyseerr Support
**User demand:** Requested in r/radarr and r/selfhosted. Overseerr and Jellyseerr are converging into "Seerr" but users need Jellyseerr support now.
**What:** Add `jellyseerr` as a valid `serviceType`. Jellyseerr's API is compatible with Overseerr v1 API surface, so it's largely a config change + label update.
**Scope:**
- Add `'jellyseerr'` to `serviceType` enum in DB schema (migration required)
- Add `JellyseerrClient` (or reuse `OverseerrClient` with a type alias)
- Update frontend service config form to show Jellyseerr as an option
- Update `mediaSearchService`, `requestApprovalService`, `conversationService` to handle `jellyseerr` serviceType
- Update documentation and screenshots
**Files:** `backend/src/db/schema.ts`, `backend/src/services/integrations/overseerr.client.ts`, `backend/src/services/integrations/media-search.service.ts`, `backend/src/services/conversation/request-approval.service.ts`, frontend service config components
**Effort:** Small-Medium (API is compatible, mostly plumbing)

---

### [P1-B] Movie Posters in WhatsApp Search Results
**User demand:** "any thoughts on adding posters to the search results like Addarr does for Telegram?" — BGentler, r/selfhosted
**What:** When returning search results to WhatsApp, send the movie/show poster image alongside (or instead of) text-only results.
**Scope:**
- Add `sendImage(recipient, imageUrl, caption)` method to `WhatsAppClientService`
  - Baileys supports `{ image: { url: '...' }, caption: '...' }` message type
- Fetch poster URL: already available as `posterPath` in `NormalizedResult` (never used currently)
  - Poster base URLs: TMDB (`https://image.tmdb.org/t/p/w500{posterPath}`), Overseerr (`{baseUrl}/imageproxy/...`)
- Option A: Send one image per result (noisy for 5 results)
- Option B: Send a collage/grid (complex)
- Option C: Send text list as before, but when user selects a result, send the poster for that specific title as confirmation
  - **Recommended** — less noise, better UX, simpler to implement
- Make this configurable via admin settings (on/off toggle: "Send poster on selection")
**Files:** `backend/src/services/whatsapp/whatsapp-client.service.ts`, `backend/src/services/conversation/conversation.service.ts`, `backend/src/db/schema.ts` (settings), frontend settings page
**Effort:** Medium
**Note:** Baileys `sendMessage` with `{ image: { url } }` requires the URL to be publicly reachable OR fetch the buffer first. Prefer fetching the image buffer in the backend and sending as `{ image: Buffer }`.

---

### [P1-C] Automatic Movie→Radarr / TV→Sonarr Routing
**User demand:** "Is there a way to automatically map movies→radarr, and tv→sonarr?" — Rtwose, r/sonarr v1.1.0. "it identified the target was a movie, but tried to pass it to Sonarr" — Rtwose
**What:** When a user selects a search result, the system should automatically route movies to Radarr and TV series to Sonarr (when both are configured), without requiring Overseerr.
**Current state:** `request-approval.service.ts` picks the highest-priority service regardless of media type. When both Radarr and Sonarr are configured, it may route a movie to Sonarr.
**Scope:**
- In `request-approval.service.ts`, when selecting a service config:
  - If `selectedResult.mediaType === 'movie'` → prefer `serviceType === 'radarr'` configs
  - If `selectedResult.mediaType === 'series'` → prefer `serviceType === 'sonarr'` configs
  - Fallback to Overseerr/Jellyseerr if no direct match
  - If still no match, use highest priority (current behavior)
- Add unit tests covering all routing combinations
**Files:** `backend/src/services/conversation/request-approval.service.ts`
**Effort:** Small

---

### [P1-D] Per-User Request Quotas
**User demand:** "Can't let my family in on this, my server would overload" — Supaastahhmarioo, r/sonarr v1.1.0
**What:** Allow admin to set a max number of requests per user per time window (daily/weekly). Users who hit the limit get a friendly WhatsApp message.
**Scope:**
- New DB table: `request_quotas` — `{ id, phoneNumberHash, windowType ('daily'|'weekly'|'monthly'), maxRequests, createdAt }`
  OR use the existing `settings` table with a global quota key
- Global quota setting in admin Settings page: "Max requests per user" + "Per window (daily/weekly/monthly)"
- Per-contact override: allow setting a different quota on the Contacts page
- In `request-approval.service.ts`, before approving:
  - Count requests from this `phoneNumberHash` in the current window from `request_history`
  - If count >= quota, reject with message: "You've reached your {N} request limit for this {window}. Try again {next reset time}."
- Admin dashboard: show quota usage per contact in Contacts page
**Files:** `backend/src/db/schema.ts` (new migration), `backend/src/services/conversation/request-approval.service.ts`, `backend/src/api/` (settings endpoints), frontend settings + contacts pages
**Effort:** Medium

---

## Priority 2 — Developer Experience & Ecosystem

### [P2-A] Seerr (Overseerr+Jellyseerr unified) Support
**Context:** The Overseerr and Jellyseerr teams are merging into "Seerr" (seerr.dev). Once released, add `seerr` as a service type. The API is expected to be backward-compatible.
**Scope:** Same as P1-A but for the new unified service. Monitor seerr.dev for stable release.
**Effort:** Tiny (once P1-A is done)

### [P2-B] Ombi Support
**User demand:** "I'd like to use this but I use ombi" — No-Entry1706, r/sonarr
**What:** Add Ombi as a supported media service backend.
**Scope:**
- Add `OmbiClient` implementing the same interface as `OverseerrClient`
  - `GET /api/v1/Search/movie/{query}` and `GET /api/v1/Search/tv/{query}` for search
  - `POST /api/v1/Request/movie` and `POST /api/v1/Request/tv` for requests
- Add `'ombi'` to `serviceType` enum
- Update schema, search service, request approval, and frontend
**Files:** Same pattern as P1-A
**Effort:** Medium (different API shape requires a proper new client)

### [P2-C] AI / Natural Language Conversation
**User demand:** Multiple users expected real NLP. One user noted they built an n8n+AI Telegram bot. Espumma called out the misleading "natural conversation" marketing.
**What:** Replace keyword-based intent parsing with an LLM call that understands free-form requests like "something scary to watch tonight", "the new Marvel movie", "the show about the chemistry teacher who makes drugs".
**Scope:**
- Add optional LLM integration (OpenAI-compatible endpoint, configurable in settings)
- When a message arrives and `AI_ENABLED=true`, route through LLM to extract:
  - Intent: search / status check / cancel
  - Media type: movie / series / either
  - Query: the cleaned search term
- Replace `intent-parser.ts` logic with LLM call (with fallback to current keyword parser if LLM is unavailable)
- Add admin settings: LLM provider (OpenAI, Ollama, custom), API key, model name
- Keep current keyword-based parser as fallback for offline/no-AI setups
**Files:** `backend/src/services/conversation/intent-parser.ts`, new `llm.service.ts`, admin settings
**Effort:** Large

### [P2-D] WhatsApp Business API Support
**User demand:** "Does this bot use my WhatsApp account? Then it's a hard no for me." — beeartic. Multiple users concerned about using personal number.
**What:** Add support for using a dedicated phone number / WhatsApp Business API (Meta Cloud API or self-hosted) so users don't need to use their personal account.
**Scope:**
- Add `WHATSAPP_MODE` env var: `baileys` (current, personal account) or `cloud_api` (Meta WhatsApp Cloud API)
- In `cloud_api` mode, use Meta's official REST API instead of Baileys
  - Webhook endpoint to receive messages
  - REST calls to send messages
- Document how to get a WhatsApp Business API number (Meta Developer portal)
**Files:** New `whatsapp-cloud.service.ts`, `whatsapp-client.service.ts` refactor to be interface-based, `index.ts`
**Effort:** Large

### [P2-E] TrueNAS Scale / Helm Chart Support
**User demand:** Requested in multiple threads.
**What:** Publish a TrueNAS Scale app manifest (truecharts-style) and/or a Helm chart.
**Scope:**
- Write `Chart.yaml`, `values.yaml`, and templates for Kubernetes/Helm deployment
- Or write a TrueNAS Scale app `app.yaml` following TrueCharts format
- CI: publish chart to GitHub Pages
**Effort:** Medium (mostly YAML)

---

## Priority 3 — UX Polish

### [P3-A] Improved Onboarding / First-Run UX
**User demand:** Multiple users confused about how to send the first request. "I can't work out how to actually submit a request." "Is there a particular syntax I need to use?"
**What:** After WhatsApp connects, send the bot account a welcome message explaining how to use it. Also improve the admin dashboard onboarding checklist.
**Scope:**
- After WhatsApp connects and is confirmed working, send an auto-introduction message to the admin's own number: "WAMR is connected! Your users can now request media by messaging this number. Configure a prefix in Settings to filter messages."
- In the dashboard, add a "Getting Started" checklist (1. Connect WhatsApp ✓, 2. Add a media service, 3. Set a message filter, 4. Share your number with users)
- Improve the Settings page with inline help text explaining the prefix/keyword filter
**Files:** `backend/src/services/whatsapp/`, frontend Dashboard/Settings pages
**Effort:** Small

### [P3-B] "It's Ready!" Download Complete Notifications
**Context:** The DB schema already has `notifiedSeasons` and `notifiedEpisodes` fields — notifications were partially planned. The `media-monitoring/` service directory exists.
**What:** When Sonarr/Radarr finishes downloading content, send the requester a WhatsApp message: "Good news! [Movie Title] is now available."
**Scope:**
- Webhook receiver: `POST /api/webhooks/sonarr` and `POST /api/webhooks/radarr` (already partially exists per the `media-monitoring` service)
- On webhook: match the downloaded title to a pending `request_history` entry via `tmdbId`/`tvdbId`
- Look up the requester's encrypted phone number from `request_history`
- Send a WhatsApp notification using `whatsappClientService.sendMessage()`
- Update `notifiedSeasons`/`notifiedEpisodes` to avoid duplicate notifications
- Admin dashboard: toggle "Enable download notifications" per service
**Files:** `backend/src/services/media-monitoring/`, `backend/src/api/routes/`, `backend/src/db/schema.ts`
**Effort:** Medium (infrastructure partially exists)

### [P3-C] Request Status Check via WhatsApp
**What:** Let users message the bot to check the status of their pending requests: "what's the status of my requests?" → bot replies with a list of their pending/approved/downloading requests.
**Scope:**
- Add intent detection for status queries in `intent-parser.ts`
- Query `request_history` by `phoneNumberHash` for recent requests
- Format and return status list
**Files:** `backend/src/services/conversation/intent-parser.ts`, `conversation.service.ts`
**Effort:** Small

---

## Implementation Order Recommendation

```
Phase 1 (now):    P1-C (auto-routing) + P1-A (Jellyseerr)     ← parallel
Phase 2 (next):   P1-B (posters) + P1-D (quotas)              ← parallel
Phase 3:          P3-B (notifications) + P3-A (onboarding)     ← parallel
Phase 4:          P2-B (Ombi) + P3-C (status check)            ← parallel
Phase 5:          P2-C (AI) + P2-D (Business API)              ← sequential (large)
Phase 6:          P2-A (Seerr) + P2-E (TrueNAS)                ← whenever ready
```
