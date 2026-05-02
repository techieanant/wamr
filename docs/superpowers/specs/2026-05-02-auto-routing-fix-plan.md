# Implementation Plan: Movie→Radarr / TV→Sonarr Auto-Routing Fix (P1-C)
Date: 2026-05-02

## Problem
When a user has both Radarr and Sonarr configured (without Overseerr), the service selection picks the highest-priority config regardless of media type. A user reported: "it identified the target was a movie, but tried to pass it to Sonarr."

## Root Cause
`request-approval.service.ts` calls `mediaServiceConfigRepository.findById(serviceConfigId)` where `serviceConfigId` comes from `conversation.service.ts`. The conversation service selects the service config once (at the start of a session or search) without considering whether it matches the media type of the final selection.

## Fix

### Step 1 — Find where serviceConfigId is chosen
**File:** `backend/src/services/conversation/conversation.service.ts`
- Find where `serviceConfigId` is set on the conversation session (likely during `performSearch` or `AWAITING_SELECTION` handling)
- This is the selection point to fix

### Step 2 — Prefer type-appropriate service at selection time
When the user's selection is resolved (i.e., `selectedResult.mediaType` is known), re-select the service config to prefer a type-appropriate service:

```typescript
// In conversation.service.ts, after selectedResult is determined:
const preferredServiceType = selectedResult.mediaType === 'movie' ? 'radarr' : 'sonarr';
let serviceConfigId = session.serviceConfigId; // current default

// Try to find a type-appropriate config
const allConfigs = await mediaServiceConfigRepository.findAll(); // or findEnabled()
const typeMatch = allConfigs.find(c => c.serviceType === preferredServiceType && c.isEnabled);
if (typeMatch) {
  serviceConfigId = typeMatch.id;
} else {
  // Fall back to overseerr/jellyseerr, then whatever is available
  const seerrMatch = allConfigs.find(c =>
    (c.serviceType === 'overseerr' || c.serviceType === 'jellyseerr') && c.isEnabled
  );
  if (seerrMatch) serviceConfigId = seerrMatch.id;
  // else keep session.serviceConfigId
}
```

### Step 3 — Handle mismatch gracefully in `executeRequest`
**File:** `backend/src/services/conversation/request-approval.service.ts` — `executeRequest()` (~line 258)
- Already has `else if (serviceType === 'radarr' && mediaType === 'movie')` and `else if (serviceType === 'sonarr' && mediaType === 'series')` guards
- After Step 2 fix this should rarely be hit, but add a clear error message if it is:
  ```
  "Sorry, the configured service (Radarr) can't handle TV series requests. Please contact your admin."
  ```
- Currently it silently falls through — add explicit error handling

### Step 4 — Unit Tests
**File:** `backend/src/services/conversation/__tests__/request-approval.service.test.ts` (or similar)
- Test: movie selected + only Radarr configured → routes to Radarr ✓
- Test: TV selected + only Sonarr configured → routes to Sonarr ✓
- Test: movie selected + only Sonarr configured → returns clear error ✓
- Test: movie selected + both Radarr and Sonarr configured → routes to Radarr ✓
- Test: TV selected + both Radarr and Sonarr configured → routes to Sonarr ✓
- Test: movie selected + Overseerr configured → routes to Overseerr ✓ (no change)

## Acceptance Criteria
- [ ] Movie request with Radarr+Sonarr both configured → goes to Radarr
- [ ] TV request with Radarr+Sonarr both configured → goes to Sonarr
- [ ] Movie request with only Sonarr → clear error message sent to user
- [ ] TV request with only Radarr → clear error message sent to user
- [ ] Overseerr/Jellyseerr configs are unaffected (they handle both types internally)
- [ ] All existing tests pass
- [ ] New tests added and passing
