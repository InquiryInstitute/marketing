/**
 * List Content Handler
 * GET /api/content?domain=article&limit=20&offset=0
 * Requirements: Req 1 (Content Publishing System)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ContentListResponse, ErrorResponse } from './types';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONTENT_TABLE = process.env.CONTENT_TABLE!;

/**
 * List content with pagination
 */
export async function listContent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('List content request');

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const domain = params.domain;
    const state = params.state;
    const limit = Math.min(parseInt(params.limit || '20', 10), 100); // Max 100 items
    const offset = parseInt(params.offset || '0', 10);

    // Validate domain if provided
    if (domain && !['article', 'course', 'product', 'event'].includes(domain)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: 'Invalid domain. Must be one of: article, course, product, event',
        } as ErrorResponse),
      };
    }

    // Validate state if provided
    if (state && !['draft', 'published', 'archived'].includes(state)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ValidationError',
          message: 'Invalid state. Must be one of: draft, published, archived',
        } as ErrorResponse),
      };
    }

    let items: any[] = [];
    let lastEvaluatedKey: any = undefined;

    // If domain is specified and state is published, use GSI for efficient query
    if (domain && state === 'published') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: CONTENT_TABLE,
          IndexName: 'domain-publishedAt-index',
          KeyConditionExpression: 'domain = :domain',
          FilterExpression: '#state = :state',
          ExpressionAttributeNames: {
            '#state': 'state',
          },
          ExpressionAttributeValues: {
            ':domain': domain,
            ':state': state,
          },
          ScanIndexForward: false, // Sort by publishedAt descending
          Limit: limit + offset, // Get more items to handle offset
        })
      );

      items = result.Items || [];
      lastEvaluatedKey = result.LastEvaluatedKey;
    } else {
      // Use scan with filters
      const filterExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (domain) {
        filterExpressions.push('domain = :domain');
        expressionAttributeValues[':domain'] = domain;
      }

      if (state) {
        filterExpressions.push('#state = :state');
        expressionAttributeNames['#state'] = 'state';
        expressionAttributeValues[':state'] = state;
      }

      const result = await docClient.send(
        new ScanCommand({
          TableName: CONTENT_TABLE,
          FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
          Limit: limit + offset,
        })
      );

      items = result.Items || [];
      lastEvaluatedKey = result.LastEvaluatedKey;
    }

    // Apply offset and limit
    const paginatedItems = items.slice(offset, offset + limit);
    const hasMore = items.length > offset + limit || lastEvaluatedKey !== undefined;

    const response: ContentListResponse = {
      items: paginatedItems,
      total: items.length,
      limit,
      offset,
      hasMore,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : undefined,
    };

    console.log(`Content list retrieved: ${paginatedItems.length} items`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('List content error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to list content',
      } as ErrorResponse),
    };
  }
}
