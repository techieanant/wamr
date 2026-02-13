# WAMR Authentication Implementation Plan
## Setup Wizard + Backup Codes + Docker Env Password Reset

## Overview
Implement a first-boot setup wizard with backup codes for secure account recovery, plus Docker environment-based password reset.

---

## Phase 1: Database Schema Changes

### 1. New Table: `setup_status`
**File:** `backend/src/db/schema.ts`

```typescript
export const setupStatus = sqliteTable(
  'setup_status',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  }
);

export type SetupStatus = typeof setupStatus.$inferSelect;
export type NewSetupStatus = typeof setupStatus.$inferInsert;
```

### 2. New Table: `backup_codes`
**File:** `backend/src/db/schema.ts`

```typescript
export const backupCodes = sqliteTable(
  'backup_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    adminUserId: integer('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(), // bcrypt hash of the backup code
    isUsed: integer('is_used', { mode: 'boolean' }).notNull().default(false),
    usedAt: text('used_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    userIdx: index('idx_backup_codes_user').on(table.adminUserId),
    usedIdx: index('idx_backup_codes_used').on(table.isUsed),
  })
);

export type BackupCode = typeof backupCodes.$inferSelect;
export type NewBackupCode = typeof backupCodes.$inferInsert;
```

### 3. Migration File
**File:** `backend/drizzle/migrations/0004_add_setup_and_backup_codes.sql`

```sql
-- Add setup_status table
CREATE TABLE setup_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add backup_codes table
CREATE TABLE backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_backup_codes_user ON backup_codes(admin_user_id);
CREATE INDEX idx_backup_codes_used ON backup_codes(is_used);

-- If admin users already exist, mark setup as complete
INSERT INTO setup_status (is_completed, completed_at)
SELECT 1, datetime('now')
FROM admin_users
LIMIT 1;
```

---

## Phase 2: Backend Implementation

### 1. Models
**File:** `backend/src/models/setup.model.ts`

```typescript
export interface SetupStatus {
  id: number;
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CreateSetupStatus {
  isCompleted: boolean;
  completedAt?: Date;
}

export interface BackupCode {
  id: number;
  adminUserId: number;
  codeHash: string;
  isUsed: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateBackupCode {
  adminUserId: number;
  codeHash: string;
}

export interface SetupAdminRequest {
  username: string;
  password: string;
}

export interface SetupResponse {
  success: boolean;
  backupCodes: string[]; // Plain text codes shown only once
}

export interface BackupCodeResetRequest {
  code: string;
  newPassword: string;
}
```

### 2. Repository: Setup Repository
**File:** `backend/src/repositories/setup.repository.ts`

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { setupStatus, backupCodes } from '../db/schema.js';
import type { SetupStatus, BackupCode, CreateBackupCode } from '../models/setup.model.js';

export class SetupRepository {
  async isSetupComplete(): Promise<boolean> {
    const result = await db
      .select({ isCompleted: setupStatus.isCompleted })
      .from(setupStatus)
      .limit(1);
    
    return result[0]?.isCompleted ?? false;
  }

  async completeSetup(): Promise<void> {
    await db
      .insert(setupStatus)
      .values({
        isCompleted: true,
        completedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: setupStatus.id,
        set: {
          isCompleted: true,
          completedAt: new Date().toISOString(),
        },
      });
  }

  async createBackupCodes(codes: CreateBackupCode[]): Promise<void> {
    await db.insert(backupCodes).values(codes);
  }

  async findValidBackupCode(codeHash: string): Promise<BackupCode | undefined> {
    const result = await db
      .select()
      .from(backupCodes)
      .where(eq(backupCodes.codeHash, codeHash))
      .limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0],
      isUsed: Boolean(result[0].isUsed),
      createdAt: new Date(result[0].createdAt),
      usedAt: result[0].usedAt ? new Date(result[0].usedAt) : null,
    };
  }

  async markBackupCodeUsed(id: number): Promise<void> {
    await db
      .update(backupCodes)
      .set({
        isUsed: true,
        usedAt: new Date().toISOString(),
      })
      .where(eq(backupCodes.id, id));
  }

  async getUnusedBackupCodesCount(adminUserId: number): Promise<number> {
    const result = await db
      .select({ count: backupCodes.id })
      .from(backupCodes)
      .where(
        eq(backupCodes.adminUserId, adminUserId) &&
        eq(backupCodes.isUsed, false)
      );

    return result.length;
  }

  async hasAnyBackupCodes(adminUserId: number): Promise<boolean> {
    const result = await db
      .select({ id: backupCodes.id })
      .from(backupCodes)
      .where(eq(backupCodes.adminUserId, adminUserId))
      .limit(1);

    return result.length > 0;
  }
}

export const setupRepository = new SetupRepository();
```

### 3. Repository Update: Admin User Repository
**File:** `backend/src/repositories/admin-user.repository.ts`

Add method:
```typescript
async updatePassword(id: number, passwordHash: string): Promise<void> {
  await db
    .update(adminUsers)
    .set({ passwordHash })
    .where(eq(adminUsers.id, id));
}
```

### 4. Service: Setup Service
**File:** `backend/src/services/setup/setup.service.ts`

```typescript
import { setupRepository } from '../../repositories/setup.repository.js';
import { adminUserRepository } from '../../repositories/admin-user.repository.js';
import { passwordService } from '../auth/password.service.js';
import { logger } from '../../config/logger.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0, O, 1, I
const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_COUNT = 5;

export class SetupService {
  async isSetupComplete(): Promise<boolean> {
    return setupRepository.isSetupComplete();
  }

  async createInitialAdmin(username: string, password: string): Promise<{ adminId: number; backupCodes: string[] }> {
    // Validate username
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    // Validate password
    const complexity = passwordService.validateComplexity(password);
    if (!complexity.valid) {
      throw new Error(`Password does not meet requirements: ${complexity.errors.join(', ')}`);
    }

    // Check if setup already completed
    const isComplete = await this.isSetupComplete();
    if (isComplete) {
      throw new Error('Setup has already been completed');
    }

    // Check if any admin users already exist
    const hasUsers = await adminUserRepository.hasAnyUsers();
    if (hasUsers) {
      // Mark setup as complete and throw error
      await setupRepository.completeSetup();
      throw new Error('Admin user already exists');
    }

    // Hash password
    const passwordHash = await passwordService.hash(password);

    // Create admin user
    const admin = await adminUserRepository.create({
      username,
      passwordHash,
    });

    logger.info({ userId: admin.id, username }, 'Initial admin user created');

    // Generate backup codes
    const backupCodes = await this.generateBackupCodes(admin.id);

    // Mark setup as complete
    await setupRepository.completeSetup();
    logger.info('Setup marked as complete');

    return {
      adminId: admin.id,
      backupCodes,
    };
  }

  private async generateBackupCodes(adminUserId: number): Promise<string[]> {
    const plainCodes: string[] = [];
    const hashedCodes: { adminUserId: number; codeHash: string }[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const plainCode = this.generateBackupCode();
      const hashedCode = await bcrypt.hash(plainCode, 10);
      
      plainCodes.push(plainCode);
      hashedCodes.push({
        adminUserId,
        codeHash: hashedCode,
      });
    }

    await setupRepository.createBackupCodes(hashedCodes);
    logger.info({ count: BACKUP_CODE_COUNT }, 'Backup codes generated');

    return plainCodes;
  }

  private generateBackupCode(): string {
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      code += BACKUP_CODE_CHARS.charAt(Math.floor(Math.random() * BACKUP_CODE_CHARS.length));
    }
    // Format as XXXX-XXXX-XX for readability
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 10)}`;
  }

  async resetPasswordWithBackupCode(code: string, newPassword: string): Promise<boolean> {
    // Validate new password
    const complexity = passwordService.validateComplexity(newPassword);
    if (!complexity.valid) {
      throw new Error(`Password does not meet requirements: ${complexity.errors.join(', ')}`);
    }

    // Find admin user (assuming only one admin for now)
    const admin = await adminUserRepository.findById(1);
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // Find all unused backup codes for this admin
    // We need to check each one since bcrypt hashes are unique
    const allCodes = await setupRepository.getAllBackupCodes(admin.id);
    
    let matchedCode: { id: number; codeHash: string } | null = null;
    
    for (const backupCode of allCodes) {
      if (backupCode.isUsed) continue;
      
      const isMatch = await bcrypt.compare(code.replace(/-/g, ''), backupCode.codeHash);
      if (isMatch) {
        matchedCode = backupCode;
        break;
      }
    }

    if (!matchedCode) {
      logger.warn({ username: admin.username }, 'Invalid backup code used for password reset');
      return false;
    }

    // Mark code as used
    await setupRepository.markBackupCodeUsed(matchedCode.id);

    // Update password
    const newPasswordHash = await passwordService.hash(newPassword);
    await adminUserRepository.updatePassword(admin.id, newPasswordHash);

    logger.info({ userId: admin.id, username: admin.username }, 'Password reset via backup code');
    return true;
  }

  async hasBackupCodes(adminUserId: number): Promise<boolean> {
    return setupRepository.hasAnyBackupCodes(adminUserId);
  }

  async getRemainingBackupCodesCount(adminUserId: number): Promise<number> {
    return setupRepository.getUnusedBackupCodesCount(adminUserId);
  }
}

export const setupService = new SetupService();
```

**Note:** Need to add `getAllBackupCodes` method to repository:
```typescript
async getAllBackupCodes(adminUserId: number): Promise<BackupCode[]> {
  const result = await db
    .select()
    .from(backupCodes)
    .where(eq(backupCodes.adminUserId, adminUserId));

  return result.map(row => ({
    ...row,
    isUsed: Boolean(row.isUsed),
    createdAt: new Date(row.createdAt),
    usedAt: row.usedAt ? new Date(row.usedAt) : null,
  }));
}
```

### 5. Controller: Setup Controller
**File:** `backend/src/api/controllers/setup.controller.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { setupService } from '../../services/setup/setup.service.js';
import { logger } from '../../config/logger.js';

export class SetupController {
  /**
   * Check if setup is complete
   * GET /api/setup/status
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isComplete = await setupService.isSetupComplete();

      res.status(200).json({
        success: true,
        data: {
          isComplete,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete initial setup and create admin user
   * POST /api/setup
   */
  async completeSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body;

      // Validate input
      if (!username || !password) {
        res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Username and password are required',
        });
        return;
      }

      // Create admin and generate backup codes
      const result = await setupService.createInitialAdmin(username, password);

      logger.info({ userId: result.adminId }, 'Setup completed successfully');

      res.status(201).json({
        success: true,
        data: {
          message: 'Setup completed successfully',
          backupCodes: result.backupCodes,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already been completed')) {
          res.status(403).json({
            success: false,
            code: 'SETUP_ALREADY_COMPLETE',
            message: 'Setup has already been completed',
          });
          return;
        }
        if (error.message.includes('already exists')) {
          res.status(403).json({
            success: false,
            code: 'ADMIN_EXISTS',
            message: 'An admin user already exists',
          });
          return;
        }
        if (error.message.includes('requirements')) {
          res.status(400).json({
            success: false,
            code: 'INVALID_PASSWORD',
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }

  /**
   * Reset password using backup code
   * POST /api/setup/reset-password
   */
  async resetPasswordWithBackupCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, newPassword } = req.body;

      if (!code || !newPassword) {
        res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Backup code and new password are required',
        });
        return;
      }

      // Normalize code (remove dashes)
      const normalizedCode = code.replace(/-/g, '').toUpperCase();

      const success = await setupService.resetPasswordWithBackupCode(normalizedCode, newPassword);

      if (!success) {
        res.status(401).json({
          success: false,
          code: 'INVALID_BACKUP_CODE',
          message: 'Invalid or already used backup code',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'Password reset successful. Please log in with your new password.',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('requirements')) {
        res.status(400).json({
          success: false,
          code: 'INVALID_PASSWORD',
          message: error.message,
        });
        return;
      }
      next(error);
    }
  }
}

export const setupController = new SetupController();
```

### 6. Routes: Setup Routes
**File:** `backend/src/api/routes/setup.routes.ts`

```typescript
import { Router } from 'express';
import { setupController } from '../controllers/setup.controller.js';

const router = Router();

// Public routes (no auth required)
router.get('/status', setupController.getStatus.bind(setupController));
router.post('/', setupController.completeSetup.bind(setupController));
router.post('/reset-password', setupController.resetPasswordWithBackupCode.bind(setupController));

export default router;
```

### 7. Register Routes
**File:** `backend/src/index.ts`

Add import:
```typescript
import setupRoutes from './api/routes/setup.routes';
```

Add route registration (before auth routes):
```typescript
// Setup routes (public, must be before auth)
app.use('/api/setup', setupRoutes);

// API routes (auth routes have their own rate limiting in controllers)
app.use('/api/auth', authRoutes);
```

### 8. Modified Auth Controller
**File:** `backend/src/api/controllers/auth.controller.ts`

Add setup check to login:
```typescript
import { setupService } from '../../services/setup/setup.service.js';

async login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check if setup is required
    const isSetupComplete = await setupService.isSetupComplete();
    const hasUsers = await adminUserRepository.hasAnyUsers();
    
    if (!isSetupComplete && !hasUsers) {
      res.status(403).json({
        success: false,
        code: 'SETUP_REQUIRED',
        message: 'Initial setup required. Please complete setup first.',
      });
      return;
    }

    // ... rest of login logic
  } catch (error) {
    next(error);
  }
}
```

### 9. Modified Seed Script
**File:** `backend/src/database/seed.ts`

```typescript
import { setupService } from '../services/setup/setup.service.js';
import { adminUserRepository } from '../repositories/admin-user.repository.js';
import { passwordService } from '../services/auth/password.service.js';

async function seed(): Promise<void> {
  try {
    logger.info('Starting database seeding...');

    // Check if setup is already complete
    const isSetupComplete = await setupService.isSetupComplete();
    if (isSetupComplete) {
      logger.info('Setup already complete, skipping seed');
      
      // Check for password reset flag
      await checkPasswordReset();
      return;
    }

    // Check if any admin users exist
    const hasUsers = await adminUserRepository.hasAnyUsers();
    if (hasUsers) {
      logger.info('Admin user already exists, marking setup complete');
      await setupService.completeSetup();
      
      // Check for password reset flag
      await checkPasswordReset();
      return;
    }

    // Check if using env-based credentials (for backwards compatibility/automation)
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      logger.info('Creating admin user from environment variables');
      
      const passwordHash = await passwordService.hash(process.env.ADMIN_PASSWORD);
      
      const admin = await adminUserRepository.create({
        username: process.env.ADMIN_USERNAME,
        passwordHash,
      });

      logger.info({ userId: admin.id, username: admin.username }, 'Admin user created from env vars');
      
      // Generate backup codes
      await setupService.generateBackupCodesForExistingUser(admin.id);
      
      await setupService.completeSetup();
      
      // eslint-disable-next-line no-console
      console.log('\n✅ Database seeded successfully from environment variables!');
      // eslint-disable-next-line no-console
      console.log('\n⚠️  IMPORTANT: Backup codes have been generated. View them in Settings.');
    } else {
      logger.info('No admin credentials in env, skipping seed (setup wizard will be shown)');
    }

    // Check for password reset flag
    await checkPasswordReset();
  } catch (error) {
    logger.error({ error }, 'Database seeding failed');
    throw error;
  }
}

async function checkPasswordReset(): Promise<void> {
  const resetPassword = process.env.RESET_ADMIN_PASSWORD;
  if (!resetPassword) return;

  logger.info('Password reset flag detected');

  const user = await adminUserRepository.findByUsername(process.env.ADMIN_USERNAME || 'admin');
  if (!user) {
    logger.warn('Cannot reset password: admin user not found');
    return;
  }

  const newPassword = resetPassword === 'random' 
    ? generateSecurePassword()
    : resetPassword;

  const passwordHash = await passwordService.hash(newPassword);
  await adminUserRepository.updatePassword(user.id, passwordHash);

  logger.info({ username: user.username }, 'Admin password has been reset');
  
  // eslint-disable-next-line no-console
  console.log('\n🔐 PASSWORD RESET COMPLETE');
  // eslint-disable-next-line no-console
  console.log(`   Username: ${user.username}`);
  // eslint-disable-next-line no-console
  console.log(`   New Password: ${newPassword}`);
  // eslint-disable-next-line no-console
  console.log('\n⚠️  SECURITY WARNING:');
  // eslint-disable-next-line no-console
  console.log('   Remove RESET_ADMIN_PASSWORD from your environment to prevent');
  // eslint-disable-next-line no-console
  console.log('   repeated password resets on every container restart.');
  // eslint-disable-next-line no-console
  console.log('');
}

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

**Add method to SetupService:**
```typescript
async generateBackupCodesForExistingUser(adminUserId: number): Promise<void> {
  const plainCodes: string[] = [];
  const hashedCodes: { adminUserId: number; codeHash: string }[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const plainCode = this.generateBackupCode();
    const hashedCode = await bcrypt.hash(plainCode, 10);
    
    plainCodes.push(plainCode);
    hashedCodes.push({
      adminUserId,
      codeHash: hashedCode,
    });
  }

  await setupRepository.createBackupCodes(hashedCodes);
  logger.info({ userId: adminUserId, count: BACKUP_CODE_COUNT }, 'Backup codes generated for existing user');
  
  // eslint-disable-next-line no-console
  console.log('\n📝 Backup codes have been generated. Save these in a secure password manager:');
  plainCodes.forEach((code, index) => {
    // eslint-disable-next-line no-console
    console.log(`   ${index + 1}. ${code}`);
  });
  // eslint-disable-next-line no-console
  console.log('\n⚠️  These codes can be used to reset your password if you get locked out.');
  // eslint-disable-next-line no-console
  console.log('   Each code can only be used once.\n');
}
```

---

## Phase 3: Frontend Implementation

### 1. Service: Setup Service
**File:** `frontend/src/services/setup.service.ts`

```typescript
import { apiClient } from './api.client';

export interface SetupStatus {
  isComplete: boolean;
}

export interface SetupRequest {
  username: string;
  password: string;
}

export interface SetupResponse {
  success: boolean;
  data: {
    message: string;
    backupCodes: string[];
  };
}

export interface BackupCodeResetRequest {
  code: string;
  newPassword: string;
}

export const setupService = {
  async getStatus(): Promise<SetupStatus> {
    const response = await apiClient.get<{ success: boolean; data: SetupStatus }>('/setup/status');
    return response.data.data;
  },

  async completeSetup(username: string, password: string): Promise<SetupResponse> {
    const response = await apiClient.post<SetupResponse>('/setup', {
      username,
      password,
    });
    return response.data;
  },

  async resetPasswordWithBackupCode(code: string, newPassword: string): Promise<{ success: boolean; data: { message: string } }> {
    const response = await apiClient.post('/setup/reset-password', {
      code,
      newPassword,
    });
    return response.data;
  },
};
```

### 2. Hook: Use Setup
**File:** `frontend/src/hooks/use-setup.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { setupService, type SetupStatus } from '@/services/setup.service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSetup');

interface UseSetupReturn {
  isSetupComplete: boolean | null;
  isLoading: boolean;
  error: string | null;
  checkSetupStatus: () => Promise<void>;
}

export function useSetup(): UseSetupReturn {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSetupStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const status = await setupService.getStatus();
      setIsSetupComplete(status.isComplete);
      
      logger.debug({ isComplete: status.isComplete }, 'Setup status checked');
    } catch (err) {
      logger.error({ error: err }, 'Failed to check setup status');
      setError('Failed to check setup status');
      setIsSetupComplete(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  return {
    isSetupComplete,
    isLoading,
    error,
    checkSetupStatus,
  };
}
```

### 3. Page: Setup Wizard
**File:** `frontend/src/pages/setup.tsx`

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupService } from '@/services/setup.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { createLogger } from '@/lib/logger';
import { Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';

const logger = createLogger('SetupPage');

export function SetupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const passwordRequirements = [
    { label: 'At least 6 characters', met: password.length >= 6 },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const isPasswordValid = passwordRequirements.every(req => req.met);
  const doPasswordsMatch = password === confirmPassword && password !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPasswordValid) {
      setError('Password does not meet all requirements');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await setupService.completeSetup(username, password);
      
      if (response.success) {
        setBackupCodes(response.data.backupCodes);
        logger.info('Setup completed successfully');
      }
    } catch (err: any) {
      logger.error({ error: err }, 'Setup failed');
      setError(err.response?.data?.message || 'Failed to complete setup');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleContinueToLogin = () => {
    navigate('/login');
  };

  // Show backup codes after successful setup
  if (backupCodes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">🎉 Setup Complete!</CardTitle>
            <CardDescription>
              Your admin account has been created. Save these backup codes in a secure password manager.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> These codes can be used to reset your password if you get locked out. 
                Each code can only be used once. You will not see them again!
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md border bg-muted p-3 font-mono text-sm"
                >
                  <span>{index + 1}. {code}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(code, index)}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="saved"
                checked={savedBackupCodes}
                onCheckedChange={(checked) => setSavedBackupCodes(checked as boolean)}
              />
              <Label htmlFor="saved" className="text-sm font-medium">
                I have saved these backup codes in a secure location
              </Label>
            </div>

            <Button
              onClick={handleContinueToLogin}
              disabled={!savedBackupCodes}
              className="w-full"
            >
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to WAMR</CardTitle>
          <CardDescription>
            Complete the initial setup to create your admin account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                minLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">Password requirements:</p>
              {passwordRequirements.map((req, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 ${
                    req.met ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  {req.met ? '✓' : '○'} {req.label}
                </div>
              ))}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid || !doPasswordsMatch || !username}
              className="w-full"
            >
              {isLoading ? 'Creating Account...' : 'Complete Setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4. Page: Backup Code Reset
**File:** `frontend/src/pages/backup-code-reset.tsx`

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupService } from '@/services/setup.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createLogger } from '@/lib/logger';
import { Eye, EyeOff } from 'lucide-react';

const logger = createLogger('BackupCodeResetPage');

export function BackupCodeResetPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordRequirements = [
    { label: 'At least 6 characters', met: newPassword.length >= 6 },
    { label: 'One lowercase letter', met: /[a-z]/.test(newPassword) },
    { label: 'One uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'One number', met: /\d/.test(newPassword) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword) },
  ];

  const isPasswordValid = passwordRequirements.every(req => req.met);
  const doPasswordsMatch = newPassword === confirmPassword && newPassword !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPasswordValid) {
      setError('Password does not meet all requirements');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await setupService.resetPasswordWithBackupCode(code, newPassword);
      setSuccess(true);
      logger.info('Password reset successful');
    } catch (err: any) {
      logger.error({ error: err }, 'Password reset failed');
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">✅ Password Reset Successful</CardTitle>
            <CardDescription>
              Your password has been reset. You can now log in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>
            Enter a backup code and your new password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="code">Backup Code</Label>
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XX"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter one of your backup codes (format: XXXX-XXXX-XX)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">Password requirements:</p>
              {passwordRequirements.map((req, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 ${
                    req.met ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  {req.met ? '✓' : '○'} {req.label}
                </div>
              ))}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid || !doPasswordsMatch || !code}
              className="w-full"
            >
              {isLoading ? 'Resetting Password...' : 'Reset Password'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 5. Update App.tsx
**File:** `frontend/src/App.tsx`

Add imports:
```typescript
import { SetupPage } from './pages/setup';
import { BackupCodeResetPage } from './pages/backup-code-reset';
import { useSetup } from './hooks/use-setup';
```

Modify App component:
```typescript
function App() {
  const { checkAuth, isAuthenticated } = useAuth();
  const { isSetupComplete, isLoading: isSetupLoading } = useSetup();
  // ... rest of state

  // ... existing effects

  // Show loading while checking setup
  if (isSetupLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Setup route (only if setup not complete) */}
          {!isSetupComplete && (
            <Route path="/setup" element={<SetupPage />} />
          )}
          
          {/* Backup code reset route (public) */}
          <Route path="/reset-password" element={<BackupCodeResetPage />} />

          {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          
          {/* Redirect to setup if not complete */}
          {!isSetupComplete && (
            <Route path="*" element={<Navigate to="/setup" replace />} />
          )}

          {/* Protected routes (only if setup complete) */}
          {isSetupComplete && (
            <>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <DashboardPage />
                    </MainLayout>
                  </ProtectedRoute>
                }
              />
              {/* ... other protected routes */}
            </>
          )}
          
          {/* ... rest of routes */}
        </Routes>
      </BrowserRouter>
      {/* ... */}
    </QueryClientProvider>
  );
}
```

### 6. Update Login Page
**File:** `frontend/src/pages/login.tsx`

Add link to backup code reset:
```typescript
// Add near the submit button or at bottom of form
<div className="text-center text-sm">
  <a 
    href="/reset-password" 
    className="text-primary hover:underline"
  >
    Forgot password? Use backup code
  </a>
</div>
```

---

## Phase 4: Settings Page - Display Backup Codes Info

### Update Settings Page
**File:** `frontend/src/pages/settings.tsx`

Add section to display remaining backup codes count:

```typescript
import { setupService } from '@/services/setup.service';

// Add state
const [backupCodesCount, setBackupCodesCount] = useState<number | null>(null);

// Fetch backup codes count on mount
useEffect(() => {
  setupService.getRemainingBackupCodesCount().then(count => {
    setBackupCodesCount(count);
  });
}, []);

// Add to JSX
<Card>
  <CardHeader>
    <CardTitle>Security</CardTitle>
    <CardDescription>Backup codes and password recovery</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Backup Codes</p>
        <p className="text-sm text-muted-foreground">
          {backupCodesCount !== null 
            ? `${backupCodesCount} unused backup codes remaining`
            : 'Loading...'}
        </p>
      </div>
      {backupCodesCount === 0 && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            No backup codes remaining! Contact support if you get locked out.
          </AlertDescription>
        </Alert>
      )}
    </div>
  </CardContent>
</Card>
```

---

## Phase 5: Environment Variables Documentation

### Update .env.example
**File:** `.env.example`

```bash
# Admin User (OPTIONAL - only for automated deployments)
# If not set, setup wizard will be shown on first boot
# ADMIN_USERNAME=admin@wamr.local
# ADMIN_PASSWORD=changeme123456

# Password Reset (use only when locked out)
# RESET_ADMIN_PASSWORD=your-new-password
# Or use: RESET_ADMIN_PASSWORD=random (generates secure random password)
```

### Create ENVIRONMENT.md Updates
Document:
1. First-boot setup wizard flow
2. Backup codes generation and usage
3. Password reset via Docker environment variable
4. Security best practices

---

## Phase 6: Testing Checklist

### Setup Wizard Tests
- [ ] Fresh container shows setup wizard on first access
- [ ] Username validation (min 3 chars)
- [ ] Password complexity validation (all requirements)
- [ ] Password confirmation must match
- [ ] Successfully creates admin account
- [ ] Displays 5 backup codes after setup
- [ ] Requires checkbox confirmation before continuing
- [ ] Backup codes are copyable
- [ ] Redirects to login after setup
- [ ] Setup cannot be run again (returns error)
- [ ] Existing databases with admin users skip setup

### Backup Code Tests
- [ ] Codes are generated in format XXXX-XXXX-XX
- [ ] Codes are bcrypt hashed in database
- [ ] Codes work for password reset
- [ ] Used codes cannot be reused
- [ ] Invalid codes return appropriate error
- [ ] Settings page shows remaining codes count
- [ ] Password requirements enforced on reset

### Docker Env Reset Tests
- [ ] RESET_ADMIN_PASSWORD env var resets password
- [ ] RESET_ADMIN_PASSWORD=random generates secure password
- [ ] New password printed in logs
- [ ] Warning message printed to remove env var
- [ ] Reset works on container restart
- [ ] Can log in with new password after reset

### Security Tests
- [ ] Setup endpoint rate limited
- [ ] Backup code reset endpoint rate limited
- [ ] Password complexity enforced
- [ ] No plain text passwords in logs (except reset confirmation)
- [ ] Backup codes are hashed, not stored plain text

---

## Files to Create/Modify Summary

### Backend
1. `backend/src/db/schema.ts` - Add setup_status and backup_codes tables
2. `backend/drizzle/migrations/0004_add_setup_and_backup_codes.sql` - Migration
3. `backend/src/models/setup.model.ts` - New models
4. `backend/src/repositories/setup.repository.ts` - New repository
5. `backend/src/repositories/admin-user.repository.ts` - Add updatePassword method
6. `backend/src/services/setup/setup.service.ts` - New service
7. `backend/src/api/controllers/setup.controller.ts` - New controller
8. `backend/src/api/routes/setup.routes.ts` - New routes
9. `backend/src/api/controllers/auth.controller.ts` - Add setup check
10. `backend/src/database/seed.ts` - Add password reset logic and backup code generation
11. `backend/src/index.ts` - Register setup routes

### Frontend
1. `frontend/src/services/setup.service.ts` - API client
2. `frontend/src/hooks/use-setup.ts` - Setup state hook
3. `frontend/src/pages/setup.tsx` - Setup wizard page
4. `frontend/src/pages/backup-code-reset.tsx` - Backup code reset page
5. `frontend/src/App.tsx` - Add routes and setup check
6. `frontend/src/pages/login.tsx` - Add backup code reset link
7. `frontend/src/pages/settings.tsx` - Add backup codes info

### Documentation
1. `.env.example` - Update with new env vars
2. `ENVIRONMENT.md` - Document new features
3. `README.md` - Update setup instructions

---

## Security Considerations

1. **Backup Codes**:
   - Stored as bcrypt hashes (not plain text)
   - Single-use only
   - No expiration (as requested)
   - Rate-limited reset endpoint

2. **Setup Wizard**:
   - Only works when no admin users exist
   - Can be bypassed with env vars for automation
   - Rate-limited to prevent brute force

3. **Docker Env Reset**:
   - Requires container restart (physical access)
   - Password printed only to logs
   - Clear warning to remove env var
   - Random password generation available

4. **Migration Safety**:
   - Existing databases automatically marked as setup complete
   - Backup codes generated for existing users on next seed
   - Backwards compatible with env-based setup

---

## Deployment Notes

### For New Users
1. Start container
2. Visit web UI
3. Complete setup wizard
4. Save backup codes securely
5. Start using WAMR

### For Existing Users
1. Migration runs automatically
2. Setup marked as complete
3. Backup codes generated on next seed run
4. View codes in Settings page
5. Save backup codes securely

### For Password Reset
1. Stop container
2. Add `RESET_ADMIN_PASSWORD=random` to .env.prod
3. Start container
4. Check logs for new password
5. Log in and change password
6. Remove RESET_ADMIN_PASSWORD from env

This plan provides a complete, secure authentication system with multiple recovery options while maintaining backwards compatibility.
