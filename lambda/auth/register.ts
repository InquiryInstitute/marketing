/**
 * Register Lambda Function
 * POST /api/auth/register
 * Creates a new user account in Cognito
 */

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RegisterRequest, ErrorResponse, JwtPayload } from './types';
import { RateLimiter } from './rate-limiter';
import { generateToken } from './jwt';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

/**
 * Validate registration request
 */
function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body.email || typeof body.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  if (!body.password || typeof body.password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  if (!body.name || typeof body.name !== 'string') {
    return { valid: false, error: 'Name is required' };
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Password validation (Cognito will also validate, but we check early)
  if (body.password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters' };
  }

  if (!/[a-z]/.test(body.password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(body.password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[0-9]/.test(body.password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Lambda handler for user registration
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Register request:', JSON.stringify({ ...event, body: '[REDACTED]' }));

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

    const body: RegisterRequest = JSON.parse(event.body);

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

    // Check rate limit by IP
    const rateLimitCheck = await RateLimiter.isRateLimited(ipAddress);
    if (rateLimitCheck.limited) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '900', // 15 minutes
        },
        body: JSON.stringify({
          error: 'TooManyRequests',
          message: rateLimitCheck.reason || 'Too many registration attempts',
        } as ErrorResponse),
      };
    }

    // Register user in Cognito
    try {
      const signUpResult = await cognitoClient.send(
        new SignUpCommand({
          ClientId: CLIENT_ID,
          Username: body.email,
          Password: body.password,
          UserAttributes: [
            {
              Name: 'email',
              Value: body.email,
            },
            {
              Name: 'name',
              Value: body.name,
            },
          ],
        })
      );

      console.log('User registered successfully:', signUpResult.UserSub);

      // Clear rate limit on success
      await RateLimiter.clearRateLimit(ipAddress);

      // Generate JWT token
      const jwtToken = generateToken(signUpResult.UserSub!, body.email, body.name);

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'User registered successfully. Please check your email to verify your account.',
          userId: signUpResult.UserSub,
          emailVerificationRequired: true,
          accessToken: jwtToken,
          expiresIn: 86400, // 24 hours
          tokenType: 'Bearer',
        }),
      };
    } catch (cognitoError: any) {
      console.error('Cognito registration error:', cognitoError);

      // Record failed attempt
      await RateLimiter.recordFailedAttempt(ipAddress);

      // Handle specific Cognito errors
      if (cognitoError.name === 'UsernameExistsException') {
        return {
          statusCode: 409,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'UserExists',
            message: 'An account with this email already exists',
          } as ErrorResponse),
        };
      }

      if (cognitoError.name === 'InvalidPasswordException') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'InvalidPassword',
            message: cognitoError.message || 'Password does not meet requirements',
          } as ErrorResponse),
        };
      }

      throw cognitoError;
    }
  } catch (error: any) {
    console.error('Registration error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'An error occurred during registration',
      } as ErrorResponse),
    };
  }
}
