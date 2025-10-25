/**
 * Admin User Model
 * Represents admin users with authentication credentials
 */
export interface AdminUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Admin user creation data (without auto-generated fields)
 */
export interface CreateAdminUser {
  username: string;
  passwordHash: string;
}

/**
 * Admin user data for updates
 */
export interface UpdateAdminUser {
  lastLoginAt?: Date;
}

/**
 * Admin user without sensitive data (for responses)
 */
export interface SafeAdminUser {
  id: number;
  username: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}
