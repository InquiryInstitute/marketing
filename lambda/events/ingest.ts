/**
 * Event Ingestion Lambda
 * Receives behavioral events from client applications and writes to Kinesis
 * Requirements: Req 2 (Behavioral Event Tracking), Task 6.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { KinesisClient, PutRecordCommand, PutRecordsCommand } from '@aws-sdk/client-kinesis';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { randomUUID } from 'crypto';
import { CanonicalEvent, CreateEventRequest, EventType } from '../shared/types/events';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const kinesisClient = new KinesisClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const KINESIS_STREAM = process.env.KINESIS_STREAM || '';
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

// Rate limiting configuration
const RATE_LIMIT_EVENTS_PER_MINUTE = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Rate limit entry for tracking user event ingestion
 */
interface RateLimitEntry {
  userId: string;
  eventCount: number;
  windowStart: number;
  ttl: number;
}

/**
 * Validate event request
 */
function validateEventRequest(event: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!event.eventType) {
    errors.push('eventType is required');
  } else if (!['view', 'click', 'search', 'share', 'bookmark', 'complete'].includes(event.eventType)) {
    errors.push('eventType must be one of: view, click, search, share, bookmark, complete');
  }

  if (!event.sessionId) {
    errors.push('sessionId is required');
  }

  // Validate contentId for view/click events
  if (['view', 'click'].includes(event.eventType) && !event.contentId) {
    errors.push('contentId is required for view and click events');
  }

  // Validate metadata
  if (!event.metadata) {
    errors.push('metadata is required');
  } else {
    if (!event.metadata.userAgent) {
      errors.push('metadata.userAgent is required');
    }
    if (!event.metadata.deviceType) {
      errors.push('metadata.deviceType is required');
    } else if (!['mobile', 'tablet', 'desktop'].includes(event.metadata.deviceType)) {
      errors.push('metadata.deviceType must be one of: mobile, tablet, desktop');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check rate limit for user
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!userId) {
    // Anonymous users not rate limited (handled at API Gateway level)
    return { allowed: true };
  }

  const now = Date.now();
  const rateLimitKey = `event-rate-limit:${userId}`;

  try {
    // Get current rate limit entry from DynamoDB
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_EVENTS_TABLE,
        Key: { userId: rateLimitKey, timestamp: 0 }, // Use timestamp 0 for rate limit entries
      })
    );

    const entry = result.Item as RateLimitEntry | undefined;

    // No previous entry or window expired
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      return { allowed: true };
    }

    // Check if limit exceeded
    if (entry.eventCount >= RATE_LIMIT_EVENTS_PER_MINUTE) {
      const remainingSeconds = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Maximum ${RATE_LIMIT_EVENTS_PER_MINUTE} events per minute. Try again in ${remainingSeconds} seconds.`,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Fail open - don't block on rate limiter errors
    return { allowed: true };
  }
}

/**
 * Update rate limit counter
 */
async function updateRateLimit(userId: string, eventCount: number): Promise<void> {
  if (!userId) return;

  const now = Date.now();
  const rateLimitKey = `event-rate-limit:${userId}`;

  try {
    // Get current entry
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_EVENTS_TABLE,
        Key: { userId: rateLimitKey, timestamp: 0 },
      })
    );

    const entry = result.Item as RateLimitEntry | undefined;

    let newEventCount: number;
    let windowStart: number;

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      // New window
      newEventCount = eventCount;
      windowStart = now;
    } else {
      // Increment counter
      newEventCount = entry.eventCount + eventCount;
      windowStart = entry.windowStart;
    }

    // Save updated entry with TTL (expire after 2 minutes)
    await docClient.send(
      new PutCommand({
        TableName: USER_EVENTS_TABLE,
        Item: {
          userId: rateLimitKey,
          timestamp: 0,
          eventCount: newEventCount,
          windowStart,
          ttl: Math.floor((now + 2 * 60 * 1000) / 1000),
        },
      })
    );
  } catch (error) {
    console.error('Error updating rate limit:', error);
    // Don't throw - rate limiting is best effort
  }
}

/**
 * Create canonical event from request
 */
function createCanonicalEvent(request: CreateEventRequest): CanonicalEvent {
  return {
    version: '2.0',
    eventId: randomUUID(),
    eventType: request.eventType,
    timestamp: new Date().toISOString(),
    userId: request.userId,
    sessionId: request.sessionId,
    contentId: request.contentId,
    metadata: request.metadata,
  };
}

/**
 * Write event to Kinesis stream
 */
async function writeToKinesis(event: CanonicalEvent): Promise<void> {
  await kinesisClient.send(
    new PutRecordCommand({
      StreamName: KINESIS_STREAM,
      Data: Buffer.from(JSON.stringify(event)),
      PartitionKey: event.userId || event.sessionId, // Partition by user or session
    })
  );
}

/**
 * Write batch of events to Kinesis stream
 */
async function writeBatchToKinesis(events: CanonicalEvent[]): Promise<void> {
  await kinesisClient.send(
    new PutRecordsCommand({
      StreamName: KINESIS_STREAM,
      Records: events.map((event) => ({
        Data: Buffer.from(JSON.stringify(event)),
        PartitionKey: event.userId || event.sessionId,
      })),
    })
  );
}

/**
 * Store event metadata in DynamoDB
 */
async function storeEventMetadata(event: CanonicalEvent): Promise<void> {
  if (!event.userId) {
    // Don't store metadata for anonymous events
    return;
  }

  const timestamp = new Date(event.timestamp).getTime();

  try {
    // Store event in user history
    await docClient.send(
      new PutCommand({
        TableName: USER_EVENTS_TABLE,
        Item: {
          userId: event.userId,
          timestamp,
          eventId: event.eventId,
          eventType: event.eventType,
          sessionId: event.sessionId,
          contentId: event.contentId,
          metadata: event.metadata,
          ttl: Math.floor((timestamp + 7 * 24 * 60 * 60 * 1000) / 1000), // 7 days TTL
        },
      })
    );
  } catch (error) {
    console.error('Error storing event metadata:', error);
    // Don't throw - metadata storage is best effort
  }
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(
  metricName: string,
  value: number,
  unit: StandardUnit = StandardUnit.Count
): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}`,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Error publishing metrics:', error);
    // Don't throw - metrics are best effort
  }
}

/**
 * Lambda handler for single event ingestion
 */
export async function handleSingleEvent(request: CreateEventRequest): Promise<{
  statusCode: number;
  body: string;
}> {
  // Validate request
  const validation = validateEventRequest(request);
  if (!validation.valid) {
    await publishMetrics('ValidationErrors', 1);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'Invalid event request',
        errors: validation.errors,
      }),
    };
  }

  // Check rate limit
  if (request.userId) {
    const rateLimit = await checkRateLimit(request.userId);
    if (!rateLimit.allowed) {
      await publishMetrics('RateLimitHits', 1);
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: 'RateLimitExceeded',
          message: rateLimit.reason,
        }),
      };
    }
  }

  try {
    // Create canonical event
    const event = createCanonicalEvent(request);

    // Write to Kinesis
    await writeToKinesis(event);

    // Store metadata in DynamoDB (async, best effort)
    storeEventMetadata(event).catch((err) =>
      console.error('Failed to store event metadata:', err)
    );

    // Update rate limit counter
    if (request.userId) {
      updateRateLimit(request.userId, 1).catch((err) =>
        console.error('Failed to update rate limit:', err)
      );
    }

    // Publish metrics
    await publishMetrics('EventsIngested', 1);
    await publishMetrics(`EventType_${request.eventType}`, 1);

    return {
      statusCode: 202,
      body: JSON.stringify({
        eventId: event.eventId,
        message: 'Event accepted for processing',
      }),
    };
  } catch (error) {
    console.error('Error ingesting event:', error);
    await publishMetrics('IngestionErrors', 1);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to ingest event',
      }),
    };
  }
}

/**
 * Lambda handler for batch event ingestion
 */
export async function handleBatchEvents(requests: CreateEventRequest[]): Promise<{
  statusCode: number;
  body: string;
}> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'Request body must be a non-empty array of events',
      }),
    };
  }

  if (requests.length > 100) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'Maximum 100 events per batch',
      }),
    };
  }

  // Validate all events
  const validationResults = requests.map((req) => validateEventRequest(req));
  const invalidEvents = validationResults
    .map((result, index) => ({ index, result }))
    .filter(({ result }) => !result.valid);

  if (invalidEvents.length > 0) {
    await publishMetrics('ValidationErrors', invalidEvents.length);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'Some events failed validation',
        invalidEvents: invalidEvents.map(({ index, result }) => ({
          index,
          errors: result.errors,
        })),
      }),
    };
  }

  // Check rate limit for authenticated users
  const userIds = [...new Set(requests.map((r) => r.userId).filter(Boolean))];
  for (const userId of userIds) {
    const userEventCount = requests.filter((r) => r.userId === userId).length;
    const rateLimit = await checkRateLimit(userId!);
    if (!rateLimit.allowed) {
      await publishMetrics('RateLimitHits', 1);
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: 'RateLimitExceeded',
          message: rateLimit.reason,
          userId,
        }),
      };
    }
  }

  try {
    // Create canonical events
    const events = requests.map((req) => createCanonicalEvent(req));

    // Write batch to Kinesis
    await writeBatchToKinesis(events);

    // Store metadata in DynamoDB (async, best effort)
    Promise.all(events.map((event) => storeEventMetadata(event))).catch((err) =>
      console.error('Failed to store event metadata:', err)
    );

    // Update rate limit counters
    for (const userId of userIds) {
      const userEventCount = requests.filter((r) => r.userId === userId).length;
      updateRateLimit(userId!, userEventCount).catch((err) =>
        console.error('Failed to update rate limit:', err)
      );
    }

    // Publish metrics
    await publishMetrics('EventsIngested', events.length);
    const eventTypeCounts = events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<EventType, number>);

    for (const [eventType, count] of Object.entries(eventTypeCounts)) {
      await publishMetrics(`EventType_${eventType}`, count);
    }

    return {
      statusCode: 202,
      body: JSON.stringify({
        message: 'Events accepted for processing',
        count: events.length,
        eventIds: events.map((e) => e.eventId),
      }),
    };
  } catch (error) {
    console.error('Error ingesting batch events:', error);
    await publishMetrics('IngestionErrors', requests.length);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to ingest events',
      }),
    };
  }
}

/**
 * Main Lambda handler
 */
export async function handler(event: any): Promise<any> {
  console.log('Event ingestion request:', JSON.stringify(event));

  // Parse request body
  let body: any;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InvalidJSON',
        message: 'Request body must be valid JSON',
      }),
    };
  }

  // Determine if single or batch request
  const isBatch = Array.isArray(body);

  let result;
  if (isBatch) {
    result = await handleBatchEvents(body);
  } else {
    result = await handleSingleEvent(body);
  }

  return {
    ...result,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  };
}
