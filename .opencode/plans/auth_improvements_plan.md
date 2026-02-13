# WAMR Authentication Improvements Plan

## Overview
Implement a first-boot setup wizard for initial admin account creation and a Docker-based password reset mechanism for account recovery.

## Problems Being Solved

1. **Current Issue**: Environment-based credentials are only used on first boot. If user changes ADMIN_PASSWORD in env after first boot, it has no effect because seed script skips when user exists.

2. **Account Recovery**: No way to reset forgotten passwords without database access.

## Proposed Solutions

### Solution 1: First-Boot Setup Wizard

Replace env-based admin creation with a UI-based setup process on first boot.

#### Backend Changes

**1. New Database Table: `setup_status`**
```typescript
export const setupStatus = sqliteTable('setup_status', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: text('completed_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
```

**2. New Service: `SetupService`**
- `isSetupComplete(): Promise<boolean>` - Check if setup is done
- `completeSetup(): Promise<void>` - Mark setup as complete
- `createInitialAdmin(username, password): Promise<AdminUser>` - Create first admin

**3. New Controller: `SetupController`**
- `GET /api/setup/status` - Check if setup is complete (public)
- `POST /api/setup` - Create initial admin account (only if no users exist)

**4. Modified Auth Flow**
- Login endpoint checks if setup is complete
- If setup incomplete and no users exist, return special error code `SETUP_REQUIRED`
- Frontend redirects to setup wizard

#### Frontend Changes

**1. New Page: `/setup`**
- Setup wizard component
- Username input with validation
- Password input with strength indicator
- Confirm password field
- Submit to create admin account
- After success, redirect to login

**2. Modified Auth Flow**
- On app load, check setup status via `/api/setup/status`
- If incomplete, redirect to `/setup`
- If complete, normal auth flow

**3. UI Design**
- Full-page wizard (no sidebar)
- Welcome message explaining first-time setup
- Clear password requirements display
- Success confirmation with redirect to login

---

### Solution 2: Docker-Based Password Reset

Allow password reset via environment variable flag for account recovery.

#### Implementation

**1. New Environment Variable**
```bash
RESET_ADMIN_PASSWORD=newpassword123  # or
RESET_ADMIN_PASSWORD=random          # generates secure random password
```

**2. Modified Seed Script (`seed.ts`)**
```typescript
// Check for password reset flag
if (process.env.RESET_ADMIN_PASSWORD) {
  const user = await adminUserRepository.findByUsername('admin');
  if (user) {
    const newPassword = process.env.RESET_ADMIN_PASSWORD === 'random' 
      ? generateSecurePassword()
      : process.env.RESET_ADMIN_PASSWORD;
    
    const passwordHash = await passwordService.hash(newPassword);
    await adminUserRepository.updatePassword(user.id, passwordHash);
    
    logger.info('Admin password has been reset');
    console.log('\n🔐 Password Reset Complete');
    console.log(`   Username: ${user.username}`);
    console.log(`   New Password: ${newPassword}`);
    console.log('\n⚠️  Remove RESET_ADMIN_PASSWORD from environment to prevent repeated resets');
  }
}
```

**3. Repository Addition**
```typescript
// admin-user.repository.ts
async updatePassword(id: number, passwordHash: string): Promise<void> {
  await db
    .update(adminUsers)
    .set({ passwordHash })
    .where(eq(adminUsers.id, id));
}
```

**4. Password Generation Utility**
```typescript
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const length = 16;
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
```

#### Usage Workflow

1. User forgets password
2. Stops Docker container
3. Adds to `.env.prod`: `RESET_ADMIN_PASSWORD=random`
4. Starts container
5. New password printed in logs
6. User logs in with new password
7. User removes `RESET_ADMIN_PASSWORD` from env

---

## Migration Strategy

### For Existing Users
- Existing databases with admin users will continue to work
- Setup wizard will be skipped (setup marked as complete)
- Password reset flag available for recovery

### Database Migration
```sql
-- Add setup_status table
CREATE TABLE setup_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- If admin users exist, mark setup as complete
INSERT INTO setup_status (is_completed, completed_at)
SELECT 1, datetime('now')
FROM admin_users
LIMIT 1;
```

---

## File Changes Summary

### Backend
1. `backend/src/db/schema.ts` - Add setup_status table
2. `backend/drizzle/migrations/0004_add_setup_status.sql` - Migration
3. `backend/src/repositories/admin-user.repository.ts` - Add updatePassword method
4. `backend/src/repositories/setup.repository.ts` - New repository
5. `backend/src/services/setup/setup.service.ts` - New service
6. `backend/src/api/controllers/setup.controller.ts` - New controller
7. `backend/src/api/routes/setup.routes.ts` - New routes
8. `backend/src/api/controllers/auth.controller.ts` - Check setup status
9. `backend/src/database/seed.ts` - Add password reset logic
10. `backend/src/index.ts` - Register new routes

### Frontend
1. `frontend/src/pages/setup.tsx` - New setup wizard page
2. `frontend/src/App.tsx` - Add setup route, check setup status
3. `frontend/src/services/setup.service.ts` - API client for setup
4. `frontend/src/hooks/use-setup.ts` - Hook for setup state

### Documentation
1. `ENVIRONMENT.md` - Update to remove ADMIN_USERNAME/PASSWORD requirement
2. `README.md` - Add first-boot setup instructions
3. `docker-compose.prod.yml` - Remove default ADMIN_USERNAME/PASSWORD

---

## Security Considerations

1. **Setup Endpoint Protection**:
   - Only works when no admin users exist
   - Rate limited to prevent brute force during setup window
   - Setup token could be added for additional security

2. **Password Reset**:
   - Requires container restart (physical access to deployment)
   - Password printed only to logs (not exposed via API)
   - Clear warning to remove flag after use
   - Random password generation available for stronger security

3. **Environment Variables**:
   - Remove ADMIN_USERNAME and ADMIN_PASSWORD from docs
   - Keep as optional override for automated deployments
   - Document that these are only used on first boot

---

## Testing Checklist

- [ ] Fresh Docker container shows setup wizard
- [ ] Setup wizard creates admin account successfully
- [ ] After setup, redirects to login
- [ ] Login works with created credentials
- [ ] Restarting container doesn't show setup again
- [ ] Password reset flag resets password
- [ ] Random password generation works
- [ ] Logs show clear reset confirmation
- [ ] Migration works for existing databases

## Questions for User

1. Should we keep ADMIN_USERNAME/PASSWORD env vars as optional for automated deployments (CI/CD, etc.)?
2. Should the setup wizard allow creating multiple admin accounts, or just one?
3. Should we add a setup token (auto-generated secret printed in logs) for additional security during setup?
