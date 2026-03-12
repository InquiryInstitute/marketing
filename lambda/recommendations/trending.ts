/**
 * Trending Content Calculation Lambda
 * Calculates trending scores for content based on engagement
 * Requirements: Req 4 (Rules-based layer - trending boost), Task 9.2
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { ScheduledEvent } from 'aws-lambda';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const TRENDING_SCORES_TABLE = process.env.TRENDING_SCORES_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';
const TRENDING_WINDOW_DAYS = parseInt(process.env.TRENDING_WINDOW_DAYS || '7', 10);

/**
 * Trending score entry
 */
interface TrendingScore {
  contentId: string;
  score: number;
  viewCount: number;
  lastUpdated: string;
}

/**
 * Calculate trending score for content
 */
function calculateTrendingScore(viewCount: number, ageHours: number): number {
  // Simple trending formula: views / age (with decay)
  // Newer content gets a boost
  const ageDays = ageHours / 24;
  const decayFactor = Math.max(1 - ageDays / TRENDING_WINDOW_DAYS, 0.1);
  return (viewCount * decayFactor) / 100; // Normalize score
}

/**
 * Get content view counts from user events
 */
async function getContentViewCounts(days: number): Promise<Map<string, number>> {
  const viewCounts = new Map<string, number>();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    // Query user-events table for view events in the last N days
    // This would use a GSI on timestamp
    // For now, we'll return an empty map (placeholder)

    return viewCounts;
  } catch (error) {
    console.error('Error getting view counts:', error);
    throw error;
  }
}

/**
 * Update trending scores in DynamoDB
 */
async function updateTrendingScores(scores: Map<string, number>): Promise<void> {
  const now = new Date().toISOString();
  const items: any[] = [];

  for (const [contentId, score] of scores.entries()) {
    items.push({
      PutRequest: {
        Item: {
          contentId,
          score,
          viewCount: 0, // Will be updated separately
          lastUpdated: now,
        },
      },
    });
  }

  // Batch write in chunks of 25
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TRENDING_SCORES_TABLE]: chunk,
        },
      })
    );
  }
}

/**
 * Apply trending boost to recommendations
 */
export function applyTrendingBoost(score: number): number {
  // Apply 20% boost to trending content
  return score * 1.2;
}

/**
 * Lambda handler for trending calculation
 */
export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('Trending calculation triggered:', JSON.stringify(event));

  try {
    // Get view counts from user events
    const viewCounts = await getContentViewCounts(TRENDING_WINDOW_DAYS);
    console.log(`Found ${viewCounts.size} content items with views`);

    // Calculate trending scores
    const scores = new Map<string, number>();
    const now = new Date();

    for (const [contentId, viewCount] of viewCounts.entries()) {
      // Calculate age in hours (simplified)
      const ageHours = TRENDING_WINDOW_DAYS * 24;
      const score = calculateTrendingScore(viewCount, ageHours);
      scores.set(contentId, score);
    }

    // Update trending scores in DynamoDB
    await updateTrendingScores(scores);

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Trending`,
        MetricData: [
          {
            MetricName: 'ContentScored',
            Value: scores.size,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );

    console.log(`Calculated trending scores for ${scores.size} content items`);
  } catch (error) {
    console.error('Error calculating trending scores:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Trending`,
        MetricData: [
          {
            MetricName: 'CalculationErrors',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
    throw error;
  }
}
