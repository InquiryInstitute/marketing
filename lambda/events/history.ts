/**
 * Event History API Lambda
 * Returns user's event history from DynamoDB
 * Requirements: Req 2 (Event tracking for user history), Task 6.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CanonicalEvent } from '../shared/types/events';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Query parameters for event history
 */
interface EventHistoryQuery {
  limit?: number;
  offset?: number;
  eventType?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Parse query parameters from API Gateway event
 */
function parseQueryParams(event: APIGatewayEvent): EventHistoryQuery {
  const params: EventHistoryQuery = {};

  if (event.queryStringParameters) {
    if (event.queryStringParameters.limit) {
      params.limit = parseInt(event.queryStringParameters.limit, 10);
    }
    if (event.queryStringParameters.offset) {
      params.offset = parseInt(event.queryStringParameters.offset, 10);
    }
    if (event.queryStringParameters.eventType) {
      params.eventType = event.queryStringParameters.eventType;
    }
    if (event.queryStringParameters.startTime) {
      params.startTime = event.queryStringParameters.startTime;
    }
    if (event.queryStringParameters.endTime) {
      params.endTime = event.queryStringParameters.endTime;
    }
  }

  // Set defaults
  params.limit = params.limit || 50;
  params.offset = params.offset || 0;

  return params;
}

/**
 * Validate query parameters
 */
function validateQueryParams(params: EventHistoryQuery): { valid: boolean; error?: string } {
  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    return { valid: false, error: 'limit must be between 1 and 100' };
  }

  if (params.offset && params.offset < 0) {
    return { valid: false, error: 'offset must be non-negative' };
  }

  if (params.eventType && !['view', 'click', 'search', 'share', 'bookmark', 'complete'].includes(params.eventType)) {
    return { valid: false, error: 'eventType must be one of: view, click, search, share, bookmark, complete' };
  }

  return { valid: true };
}

/**
 * Build DynamoDB query
 */
function buildQuery(userId: string, params: EventHistoryQuery) {
  const paramsObj: any = {
    TableName: USER_EVENTS_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false, // Descending order (newest first)
    Limit: params.limit + 1, // Get one extra to check if there are more
  };

  // Add offset using ExclusiveStartKey
  if (params.offset > 0) {
    // For simplicity, we'll handle offset in memory
    // In production, you might want to use a GSI with offset support
    paramsObj.Limit = params.offset + params.limit + 1;
  }

  // Add event type filter if specified
  if (params.eventType) {
    paramsObj.FilterExpression = 'eventType = :eventType';
    paramsObj.ExpressionAttributeValues[':eventType'] = params.eventType;
  }

  // Add time range filter if specified
  if (params.startTime || params.endTime) {
    let filterExpression = '';
    const expressionAttributeValues: any = {};

    if (params.startTime) {
      filterExpression = '#timestamp >= :startTime';
      expressionAttributeValues[':startTime'] = new Date(params.startTime).getTime();
      paramsObj.ExpressionAttributeNames = { '#timestamp': 'timestamp' };
    }

    if (params.endTime) {
      if (filterExpression) {
        filterExpression += ' AND ';
      }
      filterExpression += '#timestamp <= :endTime';
      expressionAttributeValues[':endTime'] = new Date(params.endTime).getTime();
      paramsObj.ExpressionAttributeNames = { '#timestamp': 'timestamp' };
    }

    if (filterExpression) {
      paramsObj.FilterExpression = filterExpression;
      paramsObj.ExpressionAttributeValues = {
        ...paramsObj.ExpressionAttributeValues,
        ...expressionAttributeValues,
      };
    }
  }

  return paramsObj;
}

/**
 * Format event for response
 */
function formatEvent(item: any): CanonicalEvent {
  return {
    version: '2.0',
    eventId: item.eventId,
    eventType: item.eventType,
    timestamp: new Date(item.timestamp).toISOString(),
    sessionId: item.sessionId,
    userId: item.userId,
    contentId: item.contentId,
    metadata: item.metadata,
  };
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/EventHistory`,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Error publishing metrics:', error);
  }
}

/**
 * Lambda handler for event history API
 */
export async function handler(
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  console.log('Event history request:', JSON.stringify(event));

  // Extract userId from path parameter
  const userId = event.pathParameters?.userId;
  if (!userId) {
    await publishMetrics('MissingUserId', 1);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'userId path parameter is required',
      }),
    };
  }

  // Parse and validate query parameters
  const queryParams = parseQueryParams(event);
  const validation = validateQueryParams(queryParams);

  if (!validation.valid) {
    await publishMetrics('ValidationError', 1);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'ValidationError',
        message: validation.error,
      }),
    };
  }

  try {
    // Build and execute query
    const query = buildQuery(userId, queryParams);

    const result = await docClient.send(new QueryCommand(query));

    // Handle offset
    let items = result.Items || [];
    if (queryParams.offset && queryParams.offset > 0) {
      items = items.slice(queryParams.offset);
    }

    // Limit results
    const hasMore = items.length > queryParams.limit;
    items = items.slice(0, queryParams.limit);

    // Format events
    const events = items.map(formatEvent);

    // Publish metrics
    await publishMetrics('QueriesExecuted', 1);
    await publishMetrics('EventsReturned', events.length);

    // Build response
    const response: any = {
      userId,
      events,
      pagination: {
        limit: queryParams.limit,
        offset: queryParams.offset,
        hasMore,
        total: result.Count || 0,
      },
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error fetching event history:', error);
    await publishMetrics('QueryErrors', 1);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to fetch event history',
      }),
    };
  }
}
