/**
 * JWT Token Generation and Validation
 * Implements JWT token generation for authentication endpoints
 * Requirements: Req 6 (User Authentication) - JWT token generation and validation
 */

import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'inquiry-growth-jwt-secret-key-change-in-production';
const JWT_EXPIRATION = '24h'; // 24 hours as per requirements

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

/**
 * Generate a JWT token for a user
 * @param userId - Cognito user ID
 * @param email - User email
 * @param name - User name
 * @returns JWT token string
 */
export function generateToken(userId: string, email: string, name: string): string {
  const payload: JwtPayload = {
    userId,
    email,
    name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
    algorithm: 'HS256',
  });
}

/**
 * Validate a JWT token
 * @param token - JWT token string
 * @returns Parsed payload if valid, throws error if invalid
 */
export function validateToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error('Token validation failed');
  }
}

/**
 * Decode a JWT token without verification (for debugging)
 * @param token - JWT token string
 * @returns Parsed payload
 */
export function decodeToken(token: string): JwtPayload {
  return jwt.decode(token) as JwtPayload;
}
