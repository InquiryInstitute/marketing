/**
 * Event Ingestion Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handler } from './ingest';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));
vi.mock('@aws-sdk/client-kinesis', () => ({
  KinesisClient: vi.fn(),
}));
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: vi.fn(),
}));

describe('Event Ingestion Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept valid single event', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        userId: 'user-789',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    expect(result.body).toContain('Event accepted');
  });

  it('should reject invalid event', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        eventType: 'invalid',
        sessionId: 'session-456',
      }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('ValidationError');
  });

  it('should accept batch events', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify([
        {
          eventType: 'view',
          contentId: 'article-123',
          sessionId: 'session-456',
          metadata: {
            userAgent: 'Mozilla/5.0',
            deviceType: 'desktop',
          },
        },
        {
          eventType: 'click',
          contentId: 'article-123',
          sessionId: 'session-456',
          metadata: {
            userAgent: 'Mozilla/5.0',
            deviceType: 'desktop',
          },
        },
      ]),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    expect(result.body).toContain('Events accepted');
  });
});
