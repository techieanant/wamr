/**
 * Login credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Login response with user data
 */
export interface LoginResponse {
  user: {
    id: number;
    username: string;
  };
  message: string;
}

/**
 * JWT payload
 */
export interface JWTPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * Authenticated request (extends Express Request)
 */
export interface AuthenticatedRequest {
  user?: JWTPayload;
}
