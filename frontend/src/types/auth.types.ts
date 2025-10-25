/**
 * Login credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Authenticated user data
 */
export interface AuthUser {
  id: number;
  username: string;
}

/**
 * Login response from API
 */
export interface LoginResponse {
  success: boolean;
  data: {
    user: AuthUser;
    message: string;
  };
}

/**
 * Auth error response
 */
export interface AuthError {
  success: false;
  code: string;
  message: string;
}

/**
 * Current user response
 */
export interface CurrentUserResponse {
  success: boolean;
  data: {
    user: AuthUser;
  };
}
