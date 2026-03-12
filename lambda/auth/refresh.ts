/**
 * Refresh Token Lambda Function
 * POST /api/auth/refresh
 * Refreshes access token using refresh token
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RefreshRequest, AuthResponse, ErrorResponse, JwtPayload } from './types';
import { generateToken } from './jwt';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

/**
 * Lambda handler for token refresh
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Refresh token request:', JSON.stringify({ ...event, body: '[REDACTED]' }));

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

    const body: RefreshRequest = JSON.parse(event.body);

    if (!body.refreshToken || typeof body.refreshToken !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: 'Refresh token is required',
        } as ErrorResponse),
      };
    }

    // Refresh tokens with Cognito
    try {
      const authResult = await cognitoClient.send(
        new InitiateAuthCommand({
          ClientId: CLIENT_ID,
          AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
          AuthParameters: {
            REFRESH_TOKEN: body.refreshToken,
          },
        })
      );

      if (!authResult.AuthenticationResult) {
        throw new Error('Token refresh failed - no tokens returned');
      }

      console.log('Token refreshed successfully');

      // Generate new JWT token
      const jwtToken = generateToken(body.refreshToken, body.refreshToken, body.refreshToken);

      const response: AuthResponse = {
        accessToken: jwtToken,
        refreshToken: body.refreshToken, // Refresh token is not rotated
        expiresIn: authResult.AuthenticationResult.ExpiresIn || 86400, // 24 hours
        tokenType: 'Bearer',
      };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      };
    } catch (cognitoError: any) {
      console.error('Cognito refresh error:', cognitoError);

      // Handle specific Cognito errors
      if (cognitoError.name === 'NotAuthorizedException') {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Unauthorized',
            message: 'Invalid or expired refresh token',
          } as ErrorResponse),
        };
      }

      throw cognitoError;
    }
  } catch (error: any) {
    console.error('Refresh token error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'An error occurred during token refresh',
      } as ErrorResponse),
    };
  }
}
