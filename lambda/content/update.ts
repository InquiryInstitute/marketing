/**
 * Update Content Handler
 * PUT /api/content/:id
 * Requirements: Req 1 (Content Publishing System)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse, Content } from './types';
import { validateUpdateRequest } from './validation';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONTENT_TABLE = process.env.CONTENT_TABLE!;

/**
 * Check if user is admin (placeholder - will be replaced with actual auth check)
 */
function isAdmin(event: APIGatewayProxyEvent): boolean {
  // TODO: Implement actual admin check using JWT claims
  // For now, check for admin header (temporary)
  const adminHeader = event.headers['x-admin-user'];
  return adminHeader === 'true';
}

/**
 * Update content
 */
export async function updateContent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

  console.log('Update content request:', contentId);

  // Check admin authorization
  if (!isAdmin(event)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Forbidden',
        message: 'Admin access required to update content',
      } as ErrorResponse),
    };
  }

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

    const body = JSON.parse(event.body);

    // Validate request
    const validation = validateUpdateRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.error),
      };
    }

    const updateData = validation.data!;

    // Check if content exists
    const getResult = await docClient.send(
      new GetCommand({
        TableName: CONTENT_TABLE,
        Key: { id: contentId },
      })
    );

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'NotFound',
          message: 'Content not found',
        } as ErrorResponse),
      };
    }

    const existingContent = getResult.Item as Content;

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updateData.title !== undefined) {
      updateExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = updateData.title;
    }

    if (updateData.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = updateData.description;
    }

    if (updateData.body !== undefined) {
      updateExpressions.push('#body = :body');
      expressionAttributeNames['#body'] = 'body';
      expressionAttributeValues[':body'] = updateData.body;
    }

    if (updateData.topics !== undefined) {
      updateExpressions.push('#topics = :topics');
      expressionAttributeNames['#topics'] = 'topics';
      expressionAttributeValues[':topics'] = updateData.topics;
    }

    if (updateData.tags !== undefined) {
      updateExpressions.push('#tags = :tags');
      expressionAttributeNames['#tags'] = 'tags';
      expressionAttributeValues[':tags'] = updateData.tags;
    }

    if (updateData.state !== undefined) {
      updateExpressions.push('#state = :state');
      expressionAttributeNames['#state'] = 'state';
      expressionAttributeValues[':state'] = updateData.state;

      // Set publishedAt if transitioning to published
      if (updateData.state === 'published' && existingContent.state !== 'published') {
        updateExpressions.push('#publishedAt = :publishedAt');
        expressionAttributeNames['#publishedAt'] = 'publishedAt';
        expressionAttributeValues[':publishedAt'] = Date.now();
      }
    }

    if (updateData.readTime !== undefined) {
      updateExpressions.push('#readTime = :readTime');
      expressionAttributeNames['#readTime'] = 'readTime';
      expressionAttributeValues[':readTime'] = updateData.readTime;
    }

    // Always update version and updatedAt
    updateExpressions.push('#version = #version + :inc');
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#version'] = 'version';
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':inc'] = 1;
    expressionAttributeValues[':updatedAt'] = Date.now();

    // Update content in DynamoDB
    const updateResult = await docClient.send(
      new UpdateCommand({
        TableName: CONTENT_TABLE,
        Key: { id: contentId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    console.log('Content updated successfully:', contentId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateResult.Attributes),
    };
  } catch (error: any) {
    console.error('Update content error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to update content',
      } as ErrorResponse),
    };
  }
}
