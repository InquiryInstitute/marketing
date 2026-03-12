/**
 * Content Service Lambda Handler
 * Routes requests to appropriate content operations
 * Requirements: Req 1 (Content Publishing System)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createContent } from './create';
import { getContent } from './get';
import { listContent } from './list';
import { updateContent } from './update';
import { generateUploadUrl } from './assets';
import { ErrorResponse } from './types';

/**
 * Main Lambda handler
 * Routes requests based on HTTP method and path
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Content Service - Event:', JSON.stringify({
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
  }));

  try {
    const method = event.httpMethod;
    const contentId = event.pathParameters?.id;
    const path = event.path;

    // Check for asset upload endpoint
    // POST /api/content/:id/assets/upload-url
    if (method === 'POST' && contentId && path.includes('/assets/upload-url')) {
      return await generateUploadUrl(event);
    }

    // Route based on method and path
    if (method === 'POST' && !contentId) {
      // POST /api/content - Create content
      return await createContent(event);
    }

    if (method === 'GET' && contentId) {
      // GET /api/content/:id - Get single content
      return await getContent(event);
    }

    if (method === 'GET' && !contentId) {
      // GET /api/content - List content with pagination
      return await listContent(event);
    }

    if (method === 'PUT' && contentId) {
      // PUT /api/content/:id - Update content
      return await updateContent(event);
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'MethodNotAllowed',
        message: `Method ${method} not allowed for this endpoint`,
      } as ErrorResponse),
    };
  } catch (error: any) {
    console.error('Content Service error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'An error occurred processing your request',
      } as ErrorResponse),
    };
  }
}
