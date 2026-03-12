/**
 * Authentication Lambda Types
 * Shared types for authentication endpoints
 */

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  accessToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lockedUntil?: number;
}

/**
 * JWT Token Payload
 * Contains user information in the token
 */
export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}
