/**
 * Unit tests for Event Processing Lambda
 * Tests Kinesis event processing and user metric updates
 */

import { handler } from './process';
import { KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';
import { CanonicalEvent } from '../shared/types/events';

// Mock AWS SDK clients
const dynamoMock = mockClient(DynamoDBDocumentClient);
const cloudwatchMock = mockClient(CloudWatchClient);

// Set environment variables
process.env.USER_PROFILES_TABLE = 'test-user-profiles';
process.env.ENV_NAME = 'test';

describe('Event Processing Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    cloudwatchMock.reset();
    jest.clearAllMocks();
  });

  /**
   * Helper to create a Kinesis record from a CanonicalEvent
   */
  function createKinesisRecord(event: CanonicalEvent, sequenceNumber: string): KinesisStreamRecord {
    const data = Buffer.from(JSON.stringify(event)).toString('base64');
    return {
      kinesis: {
        kinesisSchemaVersion: '1.0',
        partitionKey: event.userId || event.sessionId,
        sequenceNumber,
        data,
        approximateArrivalTimestamp: Date.now() / 1000,
      },
      eventSource: 'aws:kinesis',
      eventVersion: '1.0',
      eventID: `shardId-000000000000:${sequenceNumber}`,
      eventName: 'aws:kinesis:record',
      invokeIdentityArn: 'arn:aws:iam::123456789012:role/lambda-role',
      awsRegion: 'us-east-1',
      eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789012:stream/test-stream',
    };
  }

  /**
   * Helper to create a test CanonicalEvent
   */
  function createEvent(
    eventType: string,
    userId?: string,
    timestamp?: string
  ): CanonicalEvent {
    return {
      version: '2.0',
      eventId: `event-${Math.random()}`,
      eventType: eventType as any,
      timestamp: timestamp || new Date().toISOString(),
      userId,
      sessionId: 'session-123',
      contentId: 'content-456',
      metadata: {
        userAgent: 'Mozilla/5.0',
        deviceType: 'desktop',
      },
    };
  }

  describe('Single Event Processing', () => {
    it('should process a single view event and update user profile', async () => {
      const event = createEvent('view', 'user-123');
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(dynamoMock.calls()).toHaveLength(1);
      
      const updateCall = dynamoMock.call(0).args[0].input;
      expect(updateCall.TableName).toBe('test-user-profiles');
      expect(updateCall.Key).toEqual({ userId: 'user-123' });
      expect(updateCall.UpdateExpression).toContain('totalViews');
      expect(updateCall.UpdateExpression).toContain('lastActive');
    });

    it('should process a single click event and update user profile', async () => {
      const event = createEvent('click', 'user-123');
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      
      const updateCall = dynamoMock.call(0).args[0].input;
      expect(updateCall.UpdateExpression).toContain('totalClicks');
      expect(updateCall.UpdateExpression).toContain('lastActive');
    });

    it('should process a search event and update user profile', async () => {
      const event = createEvent('search', 'user-123');
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      
      const updateCall = dynamoMock.call(0).args[0].input;
      expect(updateCall.UpdateExpression).toContain('totalSearches');
      expect(updateCall.UpdateExpression).toContain('lastActive');
    });

    it('should skip anonymous events (no userId)', async () => {
      const event = createEvent('view', undefined); // No userId
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(dynamoMock.calls()).toHaveLength(0); // No DynamoDB updates for anonymous events
    });
  });

  describe('Batch Processing', () => {
    it('should aggregate multiple events for the same user', async () => {
      const events = [
        createEvent('view', 'user-123', '2024-01-01T10:00:00Z'),
        createEvent('view', 'user-123', '2024-01-01T10:01:00Z'),
        createEvent('click', 'user-123', '2024-01-01T10:02:00Z'),
      ];

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, `00${i}`)),
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(dynamoMock.calls()).toHaveLength(1); // Single update for aggregated metrics
      
      const updateCall = dynamoMock.call(0).args[0].input;
      expect(updateCall.Key).toEqual({ userId: 'user-123' });
      expect(updateCall.ExpressionAttributeValues[':views']).toBe(2);
      expect(updateCall.ExpressionAttributeValues[':clicks']).toBe(1);
      expect(updateCall.ExpressionAttributeValues[':lastActive']).toBe('2024-01-01T10:02:00Z');
    });

    it('should process events for multiple users', async () => {
      const events = [
        createEvent('view', 'user-123'),
        createEvent('view', 'user-456'),
        createEvent('click', 'user-123'),
      ];

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, `00${i}`)),
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(dynamoMock.calls()).toHaveLength(2); // Two updates for two users
    });

    it('should process up to 100 records efficiently', async () => {
      const events = Array.from({ length: 100 }, (_, i) =>
        createEvent('view', `user-${i % 10}`) // 10 users, 10 events each
      );

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, String(i).padStart(3, '0'))),
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(dynamoMock.calls()).toHaveLength(10); // 10 users = 10 updates
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in Kinesis record', async () => {
      const invalidRecord: KinesisStreamRecord = {
        kinesis: {
          kinesisSchemaVersion: '1.0',
          partitionKey: 'test',
          sequenceNumber: '001',
          data: Buffer.from('invalid json').toString('base64'),
          approximateArrivalTimestamp: Date.now() / 1000,
        },
        eventSource: 'aws:kinesis',
        eventVersion: '1.0',
        eventID: 'shardId-000000000000:001',
        eventName: 'aws:kinesis:record',
        invokeIdentityArn: 'arn:aws:iam::123456789012:role/lambda-role',
        awsRegion: 'us-east-1',
        eventSourceARN: 'arn:aws:kinesis:us-east-1:123456789012:stream/test-stream',
      };

      const kinesisEvent: KinesisStreamEvent = {
        Records: [invalidRecord],
      };

      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('001');
    });

    it('should handle DynamoDB update errors and mark records as failed', async () => {
      const event = createEvent('view', 'user-123');
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      dynamoMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('001');
    });

    it('should continue processing other users if one fails', async () => {
      const events = [
        createEvent('view', 'user-123'),
        createEvent('view', 'user-456'),
      ];

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, `00${i}`)),
      };

      // First update succeeds, second fails
      dynamoMock
        .on(UpdateCommand, { Key: { userId: 'user-123' } })
        .resolves({})
        .on(UpdateCommand, { Key: { userId: 'user-456' } })
        .rejects(new Error('DynamoDB error'));
      
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('001');
    });

    it('should handle missing required fields in event', async () => {
      const invalidEvent = {
        version: '2.0',
        // Missing eventId, eventType, timestamp
        sessionId: 'session-123',
      };

      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(invalidEvent as any, '001')],
      };

      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      const result = await handler(kinesisEvent);

      expect(result.batchItemFailures).toHaveLength(0); // Skipped, not failed
      expect(dynamoMock.calls()).toHaveLength(0);
    });
  });

  describe('Metrics Publishing', () => {
    it('should publish CloudWatch metrics for processed events', async () => {
      const events = [
        createEvent('view', 'user-123'),
        createEvent('click', 'user-123'),
        createEvent('search', 'user-456'),
      ];

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, `00${i}`)),
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      await handler(kinesisEvent);

      expect(cloudwatchMock.calls()).toHaveLength(1);
      
      const metricsCall = cloudwatchMock.call(0).args[0].input;
      expect(metricsCall.Namespace).toBe('InquiryGrowth/test/EventProcessing');
      
      const metricNames = metricsCall.MetricData?.map((m: any) => m.MetricName) || [];
      expect(metricNames).toContain('EventsProcessed');
      expect(metricNames).toContain('ProfilesUpdated');
      expect(metricNames).toContain('ViewEventsProcessed');
      expect(metricNames).toContain('ClickEventsProcessed');
      expect(metricNames).toContain('SearchEventsProcessed');
    });

    it('should publish error metrics when processing fails', async () => {
      const event = createEvent('view', 'user-123');
      const kinesisEvent: KinesisStreamEvent = {
        Records: [createKinesisRecord(event, '001')],
      };

      dynamoMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      await handler(kinesisEvent);

      const metricsCall = cloudwatchMock.call(0).args[0].input;
      const metricNames = metricsCall.MetricData?.map((m: any) => m.MetricName) || [];
      expect(metricNames).toContain('ProcessingErrors');
    });
  });

  describe('LastActive Timestamp', () => {
    it('should update lastActive to the most recent event timestamp', async () => {
      const events = [
        createEvent('view', 'user-123', '2024-01-01T10:00:00Z'),
        createEvent('view', 'user-123', '2024-01-01T10:05:00Z'),
        createEvent('view', 'user-123', '2024-01-01T10:02:00Z'),
      ];

      const kinesisEvent: KinesisStreamEvent = {
        Records: events.map((e, i) => createKinesisRecord(e, `00${i}`)),
      };

      dynamoMock.on(UpdateCommand).resolves({});
      cloudwatchMock.on(PutMetricDataCommand).resolves({});

      await handler(kinesisEvent);

      const updateCall = dynamoMock.call(0).args[0].input;
      expect(updateCall.ExpressionAttributeValues[':lastActive']).toBe('2024-01-01T10:05:00Z');
    });
  });
});
