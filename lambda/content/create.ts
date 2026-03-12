/**
 * Create Content Handler
 * POST /api/content
 * Requirements: Req 1 (Content Publishing System)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { Content, ErrorResponse } from './types';
import { validateCreateRequest } from './validation';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONTENT_TABLE = process.env.CONTENT_TABLE!;

/**
 * Create new content
 */
export async function createContent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Create content request');

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
    const validation = validateCreateRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.error),
      };
    }

    const requestData = validation.data!;

    // Create content object
    const now = Date.now();
    const content: Content = {
      id: randomUUID(),
      domain: requestData.domain as 'article',
      title: requestData.title,
      description: requestData.description,
      body: requestData.body,
      author: requestData.author,
      topics: requestData.topics,
      tags: requestData.tags || [],
      state: requestData.state || 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Add publishedAt if state is published
    if (content.state === 'published') {
      content.publishedAt = now;
    }

    // Add domain-specific fields
    if (requestData.readTime !== undefined) {
      content.readTime = requestData.readTime;
    }

    // Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: CONTENT_TABLE,
        Item: content,
        ConditionExpression: 'attribute_not_exists(id)',
      })
    );

    console.log('Content created successfully:', content.id);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    };
  } catch (error: any) {
    console.error('Create content error:', error);

    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Conflict',
          message: 'Content with this ID already exists',
        } as ErrorResponse),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to create content',
      } as ErrorResponse),
    };
  }
}
