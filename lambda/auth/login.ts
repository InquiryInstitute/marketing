/**
 * Login Lambda Function
 * POST /api/auth/login
 * Authenticates user and returns JWT tokens
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LoginRequest, AuthResponse, ErrorResponse, JwtPayload } from './types';
import { RateLimiter } from './rate-limiter';
import { generateToken, validateToken } from './jwt';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

/**
 * Validate login request
 */
function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body.email || typeof body.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  if (!body.password || typeof body.password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  return { valid: true };
}

/**
 * Lambda handler for user login
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Login request:', JSON.stringify({ ...event, body: '[REDACTED]' }));

  // Get IP address for rate limiting
  const ipAddress = event.requestContext.identity.sourceIp || 'unknown';

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'BadRequest',
          message: 'Request body is required',
        } as ErrorResponse),
      };
    }

    const body: LoginRequest = JSON.parse(event.body);

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: validation.error,
        } as ErrorResponse),
      };
    }

    // Check rate limit by email
    const emailRateLimit = await RateLimiter.isRateLimited(body.email);
    if (emailRateLimit.limited) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '900', // 15 minutes
        },
        body: JSON.stringify({
          error: 'TooManyRequests',
          message: emailRateLimit.reason || 'Too many login attempts. Account temporarily locked.',
        } as ErrorResponse),
      };
    }

    // Check rate limit by IP
    const ipRateLimit = await RateLimiter.isRateLimited(ipAddress);
    if (ipRateLimit.limited) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '900',
        },
        body: JSON.stringify({
          error: 'TooManyRequests',
          message: ipRateLimit.reason || 'Too many login attempts from this IP',
        } as ErrorResponse),
      };
    }

    // Authenticate with Cognito
    try {
      const authResult = await cognitoClient.send(
        new InitiateAuthCommand({
          ClientId: CLIENT_ID,
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          AuthParameters: {
            USERNAME: body.email,
            PASSWORD: body.password,
          },
        })
      );

      if (!authResult.AuthenticationResult) {
        throw new Error('Authentication failed - no tokens returned');
      }

      console.log('User authenticated successfully:', body.email);

      // Clear rate limits on successful login
      await RateLimiter.clearRateLimit(body.email);
      await RateLimiter.clearRateLimit(ipAddress);

      // Generate JWT token
      const jwtToken = generateToken(body.email, body.email, body.email);

      const response: AuthResponse = {
        accessToken: jwtToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken!,
        expiresIn: authResult.AuthenticationResult.ExpiresIn || 86400, // 24 hours
        tokenType: 'Bearer',
      };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      };
    } catch (cognitoError: any) {
      console.error('Cognito authentication error:', cognitoError);

      // Record failed attempt for both email and IP
      await RateLimiter.recordFailedAttempt(body.email);
      await RateLimiter.recordFailedAttempt(ipAddress);

      // Handle specific Cognito errors
      if (
        cognitoError.name === 'NotAuthorizedException' ||
        cognitoError.name === 'UserNotFoundException'
      ) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Unauthorized',
            message: 'Invalid email or password',
          } as ErrorResponse),
        };
      }

      if (cognitoError.name === 'UserNotConfirmedException') {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'EmailNotVerified',
            message: 'Please verify your email before logging in',
          } as ErrorResponse),
        };
      }

      if (cognitoError.name === 'PasswordResetRequiredException') {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'PasswordResetRequired',
            message: 'Password reset is required',
          } as ErrorResponse),
        };
      }

      throw cognitoError;
    }
  } catch (error: any) {
    console.error('Login error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'An error occurred during login',
      } as ErrorResponse),
    };
  }
}
