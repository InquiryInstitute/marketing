/**
 * Event Processing Lambda
 * Consumes events from Kinesis Data Stream and updates user behavior metrics
 * Requirements: Req 2.6, 2.7 (Event processing and metrics), Task 6.2
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { KinesisStreamEvent, KinesisStreamRecord } from 'aws-lambda';
import { CanonicalEvent, EventType } from '../shared/types/events';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Metric counters for batch processing
 */
interface MetricCounters {
  eventsProcessed: number;
  eventsSkipped: number;
  profilesUpdated: number;
  processingErrors: number;
  viewEvents: number;
  clickEvents: number;
  searchEvents: number;
  shareEvents: number;
  bookmarkEvents: number;
  completeEvents: number;
}

/**
 * User metric updates to be applied
 */
interface UserMetricUpdate {
  userId: string;
  totalViews?: number;
  totalClicks?: number;
  totalSearches?: number;
  totalShares?: number;
  totalBookmarks?: number;
  totalCompletes?: number;
  lastActive: string;
}

/**
 * Parse Kinesis record data to CanonicalEvent
 */
function parseKinesisRecord(record: KinesisStreamRecord): CanonicalEvent | null {
  try {
    const data = Buffer.from(record.kinesis.data, 'base64').toString('utf-8');
    const event = JSON.parse(data) as CanonicalEvent;

    // Validate required fields
    if (!event.version || !event.eventId || !event.eventType || !event.timestamp) {
      console.error('Invalid event structure:', event);
      return null;
    }

    return event;
  } catch (error) {
    console.error('Error parsing Kinesis record:', error);
    return null;
  }
}

/**
 * Aggregate metric updates by userId
 */
function aggregateMetricUpdates(events: CanonicalEvent[]): Map<string, UserMetricUpdate> {
  const updates = new Map<string, UserMetricUpdate>();

  for (const event of events) {
    // Skip anonymous events (no userId)
    if (!event.userId) {
      continue;
    }

    // Get or create update entry for this user
    let update = updates.get(event.userId);
    if (!update) {
      update = {
        userId: event.userId,
        totalViews: 0,
        totalClicks: 0,
        totalSearches: 0,
        totalShares: 0,
        totalBookmarks: 0,
        totalCompletes: 0,
        lastActive: event.timestamp,
      };
      updates.set(event.userId, update);
    }

    // Increment counters based on event type
    switch (event.eventType) {
      case 'view':
        update.totalViews! += 1;
        break;
      case 'click':
        update.totalClicks! += 1;
        break;
      case 'search':
        update.totalSearches! += 1;
        break;
      case 'share':
        update.totalShares! += 1;
        break;
      case 'bookmark':
        update.totalBookmarks! += 1;
        break;
      case 'complete':
        update.totalCompletes! += 1;
        break;
    }

    // Update lastActive to most recent timestamp
    if (event.timestamp > update.lastActive) {
      update.lastActive = event.timestamp;
    }
  }

  return updates;
}

/**
 * Update user profile metrics in DynamoDB
 */
async function updateUserProfile(update: UserMetricUpdate): Promise<void> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  // Build update expression for each metric
  if (update.totalViews && update.totalViews > 0) {
    updateExpressions.push('#totalViews = if_not_exists(#totalViews, :zero) + :views');
    expressionAttributeNames['#totalViews'] = 'totalViews';
    expressionAttributeValues[':views'] = update.totalViews;
  }

  if (update.totalClicks && update.totalClicks > 0) {
    updateExpressions.push('#totalClicks = if_not_exists(#totalClicks, :zero) + :clicks');
    expressionAttributeNames['#totalClicks'] = 'totalClicks';
    expressionAttributeValues[':clicks'] = update.totalClicks;
  }

  if (update.totalSearches && update.totalSearches > 0) {
    updateExpressions.push('#totalSearches = if_not_exists(#totalSearches, :zero) + :searches');
    expressionAttributeNames['#totalSearches'] = 'totalSearches';
    expressionAttributeValues[':searches'] = update.totalSearches;
  }

  if (update.totalShares && update.totalShares > 0) {
    updateExpressions.push('#totalShares = if_not_exists(#totalShares, :zero) + :shares');
    expressionAttributeNames['#totalShares'] = 'totalShares';
    expressionAttributeValues[':shares'] = update.totalShares;
  }

  if (update.totalBookmarks && update.totalBookmarks > 0) {
    updateExpressions.push('#totalBookmarks = if_not_exists(#totalBookmarks, :zero) + :bookmarks');
    expressionAttributeNames['#totalBookmarks'] = 'totalBookmarks';
    expressionAttributeValues[':bookmarks'] = update.totalBookmarks;
  }

  if (update.totalCompletes && update.totalCompletes > 0) {
    updateExpressions.push('#totalCompletes = if_not_exists(#totalCompletes, :zero) + :completes');
    expressionAttributeNames['#totalCompletes'] = 'totalCompletes';
    expressionAttributeValues[':completes'] = update.totalCompletes;
  }

  // Always update lastActive
  updateExpressions.push('#lastActive = :lastActive');
  expressionAttributeNames['#lastActive'] = 'lastActive';
  expressionAttributeValues[':lastActive'] = update.lastActive;

  // Add zero value for if_not_exists
  expressionAttributeValues[':zero'] = 0;

  if (updateExpressions.length === 0) {
    return; // Nothing to update
  }

  await docClient.send(
    new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { userId: update.userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(counters: MetricCounters): Promise<void> {
  try {
    const metricData = [];

    if (counters.eventsProcessed > 0) {
      metricData.push({
        MetricName: 'EventsProcessed',
        Value: counters.eventsProcessed,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (counters.eventsSkipped > 0) {
      metricData.push({
        MetricName: 'EventsSkipped',
        Value: counters.eventsSkipped,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (counters.profilesUpdated > 0) {
      metricData.push({
        MetricName: 'ProfilesUpdated',
        Value: counters.profilesUpdated,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (counters.processingErrors > 0) {
      metricData.push({
        MetricName: 'ProcessingErrors',
        Value: counters.processingErrors,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    // Event type metrics
    if (counters.viewEvents > 0) {
      metricData.push({
        MetricName: 'ViewEventsProcessed',
        Value: counters.viewEvents,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (counters.clickEvents > 0) {
      metricData.push({
        MetricName: 'ClickEventsProcessed',
        Value: counters.clickEvents,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (counters.searchEvents > 0) {
      metricData.push({
        MetricName: 'SearchEventsProcessed',
        Value: counters.searchEvents,
        Unit: StandardUnit.Count,
        Timestamp: new Date(),
      });
    }

    if (metricData.length > 0) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/EventProcessing`,
          MetricData: metricData,
        })
      );
    }
  } catch (error) {
    console.error('Error publishing metrics:', error);
    // Don't throw - metrics are best effort
  }
}

/**
 * Process batch of Kinesis records
 */
async function processBatch(records: KinesisStreamRecord[]): Promise<{
  batchItemFailures: Array<{ itemIdentifier: string }>;
}> {
  console.log(`Processing batch of ${records.length} records`);

  const counters: MetricCounters = {
    eventsProcessed: 0,
    eventsSkipped: 0,
    profilesUpdated: 0,
    processingErrors: 0,
    viewEvents: 0,
    clickEvents: 0,
    searchEvents: 0,
    shareEvents: 0,
    bookmarkEvents: 0,
    completeEvents: 0,
  };

  const failedRecords: Array<{ itemIdentifier: string }> = [];
  const validEvents: CanonicalEvent[] = [];

  // Parse all records
  for (const record of records) {
    try {
      const event = parseKinesisRecord(record);
      if (event) {
        validEvents.push(event);
        counters.eventsProcessed += 1;

        // Count by event type
        switch (event.eventType) {
          case 'view':
            counters.viewEvents += 1;
            break;
          case 'click':
            counters.clickEvents += 1;
            break;
          case 'search':
            counters.searchEvents += 1;
            break;
          case 'share':
            counters.shareEvents += 1;
            break;
          case 'bookmark':
            counters.bookmarkEvents += 1;
            break;
          case 'complete':
            counters.completeEvents += 1;
            break;
        }
      } else {
        counters.eventsSkipped += 1;
        console.warn(`Skipping invalid record: ${record.kinesis.sequenceNumber}`);
      }
    } catch (error) {
      console.error(`Error parsing record ${record.kinesis.sequenceNumber}:`, error);
      counters.processingErrors += 1;
      failedRecords.push({ itemIdentifier: record.kinesis.sequenceNumber });
    }
  }

  // Aggregate metric updates by user
  const metricUpdates = aggregateMetricUpdates(validEvents);
  console.log(`Aggregated updates for ${metricUpdates.size} users`);

  // Update user profiles
  for (const [userId, update] of metricUpdates.entries()) {
    try {
      await updateUserProfile(update);
      counters.profilesUpdated += 1;
    } catch (error) {
      console.error(`Error updating profile for user ${userId}:`, error);
      counters.processingErrors += 1;
      
      // Find all records for this user and mark as failed
      for (const record of records) {
        const event = parseKinesisRecord(record);
        if (event && event.userId === userId) {
          failedRecords.push({ itemIdentifier: record.kinesis.sequenceNumber });
        }
      }
    }
  }

  // Publish metrics
  await publishMetrics(counters);

  console.log('Batch processing complete:', {
    eventsProcessed: counters.eventsProcessed,
    eventsSkipped: counters.eventsSkipped,
    profilesUpdated: counters.profilesUpdated,
    processingErrors: counters.processingErrors,
    failedRecords: failedRecords.length,
  });

  return { batchItemFailures: failedRecords };
}

/**
 * Lambda handler for Kinesis stream events
 */
export async function handler(event: KinesisStreamEvent): Promise<{
  batchItemFailures: Array<{ itemIdentifier: string }>;
}> {
  console.log(`Received Kinesis event with ${event.Records.length} records`);

  try {
    return await processBatch(event.Records);
  } catch (error) {
    console.error('Fatal error processing batch:', error);
    
    // Return all records as failed for retry
    return {
      batchItemFailures: event.Records.map((record) => ({
        itemIdentifier: record.kinesis.sequenceNumber,
      })),
    };
  }
}
