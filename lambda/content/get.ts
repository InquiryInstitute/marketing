/**
 * Get Content Handler
 * GET /api/content/:id
 * Requirements: Req 1 (Content Publishing System)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from './types';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONTENT_TABLE = process.env.CONTENT_TABLE!;

/**
 * Get content by ID
 */
export async function getContent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const contentId = event.pathParameters?.id;

  if (!contentId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'BadRequest',
        message: 'Content ID is required',
      } as ErrorResponse),
    };
  }

  console.log('Get content request:', contentId);

  try {
    // Get content from DynamoDB
    const result = await docClient.send(
      new GetCommand({
        TableName: CONTENT_TABLE,
        Key: { id: contentId },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'NotFound',
          message: 'Content not found',
        } as ErrorResponse),
      };
    }

    console.log('Content retrieved successfully:', contentId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.Item),
    };
  } catch (error: any) {
    console.error('Get content error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to retrieve content',
      } as ErrorResponse),
    };
  }
}
