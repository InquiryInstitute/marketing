/**
 * Logout Lambda Function
 * POST /api/auth/logout
 * Invalidates user tokens (global sign out)
 */

import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LogoutRequest, ErrorResponse, JwtPayload } from './types';
import { validateToken } from './jwt';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Lambda handler for user logout
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Logout request:', JSON.stringify({ ...event, body: '[REDACTED]' }));

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

    const body: LogoutRequest = JSON.parse(event.body);

    if (!body.accessToken || typeof body.accessToken !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: 'Access token is required',
        } as ErrorResponse),
      };
    }

    // Validate JWT token
    let payload: JwtPayload;
    try {
      payload = validateToken(body.accessToken);
    } catch (error: any) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'InvalidToken',
          message: error.message || 'Invalid or expired access token',
        } as ErrorResponse),
      };
    }

    console.log('Token validated successfully for user:', payload.email);

    // Global sign out from Cognito
    try {
      await cognitoClient.send(
        new GlobalSignOutCommand({
          AccessToken: body.accessToken,
        })
      );

      console.log('User logged out successfully');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Logged out successfully',
        }),
      };
    } catch (cognitoError: any) {
      console.error('Cognito logout error:', cognitoError);

      // Handle specific Cognito errors
      if (cognitoError.name === 'NotAuthorizedException') {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Unauthorized',
            message: 'Invalid or expired access token',
          } as ErrorResponse),
        };
      }

      throw cognitoError;
    }
  } catch (error: any) {
    console.error('Logout error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'An error occurred during logout',
      } as ErrorResponse),
    };
  }
}
